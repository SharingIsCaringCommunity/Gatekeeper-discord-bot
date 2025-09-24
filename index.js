// Runtime — everyone can SEE replies (no ephemeral).
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

const TOKEN       = process.env.DISCORD_TOKEN;
const LOG_CHANNEL = process.env.LOG_CHANNEL; // channel ID for logs

// --- Keepalive (Railway) ---
const app = express();
app.get('/', (_req, res) => res.send('BusyPang is running.'));
app.listen(3000, () => console.log('✅ Web server running on port 3000'));

// --- Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
});

// ===== In-memory stores (guild-scoped) =====
/** @type {Map<string, Set<string>>} guildId -> Set(userId) */
const bannedUsers = new Map();
/** @type {Map<string, Map<string, number>>} guildId -> (userId -> count) */
const warningsMap = new Map();

function getBanSet(gid) {
  if (!bannedUsers.has(gid)) bannedUsers.set(gid, new Set());
  return bannedUsers.get(gid);
}
function getWarns(gid) {
  if (!warningsMap.has(gid)) warningsMap.set(gid, new Map());
  return warningsMap.get(gid);
}

const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'clearwarns', 'warnlist']);
const isAdmin = (i) => i.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

const log = (guild, content) => {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch) ch.send({ content }).catch(() => {});
};

// ===== Ready: sync bans per guild =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch();
      const set = getBanSet(guild.id);
      set.clear();
      for (const [id] of bans) set.add(id);
      console.log(`🔄 Synced ${bans.size} bans for ${guild.name}`);
    } catch (e) {
      console.log(`⚠️ Failed to fetch bans for ${guild.name}:`, e?.message || e);
    }
  }
});

// Keep lifetime list updated per guild
client.on('guildBanAdd', (ban) => {
  getBanSet(ban.guild.id).add(ban.user.id);
});
client.on('guildBanRemove', (ban) => {
  getBanSet(ban.guild.id).delete(ban.user.id);
});

// Auto-ban if a banned user rejoins
client.on('guildMemberAdd', async (member) => {
  const g = member.guild;
  const gSet = getBanSet(g.id);
  if (gSet.has(member.id)) {
    try {
      await g.members.ban(member.id, { reason: 'Rejoined after leaving (lifetime ban)' });
      log(g, `🚫 **${member.user.tag}** tried to rejoin and was banned.`);
    } catch (e) {
      log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
    }
  } else {
    log(g, `✅ **${member.user.tag}** joined the server.`);
  }
});

// When a member leaves → perma-ban (per guild)
client.on('guildMemberRemove', async (member) => {
  const g = member.guild;
  const gSet = getBanSet(g.id);
  gSet.add(member.id);
  log(g, `❌ **${member.user.tag}** left the server — banning for life...`);
  try {
    await g.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch (e) {
    log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
  }
});

// --- Slash Command Handler ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { guild, commandName: cmd } = interaction;
  if (!guild) return;

  // Visible to all; restrict execution here
  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({
      content: '⚠️ You must be an **Admin** to use this command.'
    });
  }

  const gSet   = getBanSet(guild.id);
  const gWarns = getWarns(guild.id);

  try {
    if (cmd === 'bb') {
      const emb = new EmbedBuilder()
        .setTitle('BusyPang — Help & Commands')
        .setColor(0x00b3ff)
        .setDescription(
          [
            '### 👥 Everyone',
            '`/warnings [@user]` — Check warnings',
            '`/bb` — Show this help',
            '',
            '### 🛡️ Admin only',
            '`/warn @user [reason]` — Add warning (3 = auto-ban)',
            '`/clearwarns @user [reason]` — Reset warnings to 0',
            '`/ban @user [reason]` — Ban immediately',
            '`/pardon @user [reason]` — Unban + remove from lifetime list',
            '`/banlist` — Show lifetime ban list',
            '`/warnlist` — Show all members with warnings',
          ].join('\n')
        );
      return interaction.reply({ embeds: [emb] });
    }

    if (cmd === 'warnings') {
      const user  = interaction.options.getUser('member') || interaction.user;
      // Anyone can check anyone’s warnings (you asked to allow visibility for all)
      const count = gWarns.get(user.id) || 0;
      return interaction.reply({
        content: `🧾 **${user.tag}** has **${count}/3** warning(s).`
      });
    }

    if (cmd === 'warn') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const current = gWarns.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      gWarns.set(user.id, next);

      await interaction.reply(`⚠️ Warned **${user.tag}** — now at **${next}/3**. Reason: ${reason}`);
      log(guild, `⚠️ **${interaction.user.tag}** warned **<@${user.id}>** — ${next}/3. 📝 ${reason}`);

      if (next >= 3) {
        gSet.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (${reason})` });
          log(guild, `🚫 Auto-banned **<@${user.id}>** at 3 warnings.`);
        } catch {
          log(guild, `⚠️ Could not auto-ban **<@${user.id}>** — check role/permissions.`);
        }
      }
      return;
    }

    if (cmd === 'clearwarns') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warnings cleared by ${interaction.user.tag}`;
      gWarns.set(user.id, 0);
      await interaction.reply(`🧹 Cleared warnings for **${user.tag}**. 📝 ${reason}`);
      log(guild, `🧹 **${interaction.user.tag}** cleared warnings for **<@${user.id}>**. 📝 ${reason}`);
      return;
    }

    if (cmd === 'ban') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      gSet.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        await interaction.reply(`🚫 Banned **${user.tag}**. 📝 ${reason}`);
        log(guild, `🚫 **${interaction.user.tag}** banned **<@${user.id}>**. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not ban that user (role/permissions?).' });
      }
      return;
    }

    if (cmd === 'pardon') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Pardon issued by ${interaction.user.tag}`;
      gSet.delete(user.id);
      gWarns.set(user.id, 0);
      try {
        await guild.bans.remove(user.id, reason);
        await interaction.reply(`✅ Pardoned **${user.tag}**. 📝 ${reason}`);
        log(guild, `✅ **${interaction.user.tag}** pardoned **<@${user.id}>**. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    if (cmd === 'banlist') {
      // Always fetch live bans for THIS guild
      const bans = await guild.bans.fetch({ cache: false });
      if (!bans.size) {
        return interaction.reply({ content: '📋 No users in the lifetime ban list.' });
      }

      // Build lines "• username#1234 (<@id>)"
      const lines = [];
      for (const [, ban] of bans) {
        const tag = ban.user?.tag || ban.user?.username || ban.user?.id;
        lines.push(`• **${tag}** (<@${ban.user.id}>)`);
      }

      // Sort nicely by tag
      lines.sort((a, b) => a.localeCompare(b, 'en'));

      // Paginate into embeds
      const perPage = 20;
      const pages = Math.ceil(lines.length / perPage);
      const embeds = [];
      for (let i = 0; i < pages; i++) {
        const slice = lines.slice(i * perPage, (i + 1) * perPage).join('\n');
        embeds.push(
          new EmbedBuilder()
            .setColor(0xffc107)
            .setTitle('📋 Lifetime Ban List')
            .setDescription(slice)
            .setFooter({ text: `Page ${i + 1}/${pages} • total ${lines.length}` })
        );
      }
      return interaction.reply({ embeds });
    }

    if (cmd === 'warnlist') {
      // Admin only (guarded at top) — list all with warnings > 0
      const entries = [...gWarns.entries()].filter(([, n]) => (n || 0) > 0);
      if (!entries.length) {
        return interaction.reply({ content: '🧾 No active warnings.' });
      }

      // Resolve tags and build list
      const rows = [];
      for (const [uid, n] of entries) {
        let tag = uid;
        try {
          const u = await client.users.fetch(uid);
          tag = u?.tag || u?.username || uid;
        } catch {}
        rows.push(`• **${tag}** (<@${uid}>) — **${n}/3**`);
      }
      rows.sort((a, b) => a.localeCompare(b, 'en'));

      const perPage = 20;
      const pages = Math.ceil(rows.length / perPage);
      const embeds = [];
      for (let i = 0; i < pages; i++) {
        const slice = rows.slice(i * perPage, (i + 1) * perPage).join('\n');
        embeds.push(
          new EmbedBuilder()
            .setColor(0x00b3ff)
            .setTitle('🧾 Warning List')
            .setDescription(slice)
            .setFooter({ text: `Page ${i + 1}/${pages} • total ${rows.length}` })
        );
      }
      return interaction.reply({ embeds });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ Unexpected error. Try again.' }).catch(() => {});
    }
  }
});

client.login(TOKEN);