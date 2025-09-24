// index.js — BusyPang bot runtime (everyone sees replies)
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

const TOKEN       = process.env.DISCORD_TOKEN;
const LOG_CHANNEL = process.env.LOG_CHANNEL; // Channel ID for logs (string)

if (!TOKEN || !LOG_CHANNEL) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN and LOG_CHANNEL in Railway.');
  process.exit(1);
}

// --- Keepalive web server for Railway ---
const app = express();
app.get('/', (_req, res) => res.send('BusyPang is running.'));
app.listen(3000, () => console.log('✅ Web server running on port 3000'));

// --- Discord client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,      // needs "Server Members Intent" ON in Dev Portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,   // bans
    GatewayIntentBits.MessageContent
  ]
});

// In-memory stores
const bannedUsers = new Set();             // lifetime ban IDs
const warnings    = new Map();             // userId -> count

const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'clearwarns', 'warnlist']);
const isAdmin = (interaction) =>
  interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

const log = (guild, content) => {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  ch?.send({ content }).catch(() => {});
};

// ---- Ready: sync bans for each guild ----
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch();
      for (const [id] of bans) bannedUsers.add(id);
      console.log(`🔄 Synced ${bans.size} bans for ${guild.name}`);
    } catch (e) {
      console.log(`⚠️ Failed to fetch bans for ${guild.name}: ${e?.message || e}`);
    }
  }
});

// keep lifetime list in sync
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// autoban if a banned user rejoins
client.on('guildMemberAdd', async (member) => {
  const g = member.guild;
  if (!g) return;
  if (bannedUsers.has(member.id)) {
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

// when a member leaves → ban for life
client.on('guildMemberRemove', async (member) => {
  const g = member.guild;
  if (!g) return;
  bannedUsers.add(member.id);
  log(g, `❌ **${member.user.tag}** left the server — banning for life...`);
  try {
    await g.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch {
    log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
  }
});

// ---- Slash commands runtime (visible to all) ----
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { guild, commandName: cmd } = interaction;
  if (!guild) return;

  // Restrict execution (not visibility) for admin commands
  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({
      content: '⚠️ You must be an **Admin** to use this command.'
    });
  }

  try {
    // /bb
    if (cmd === 'bb') {
      const emb = new EmbedBuilder()
        .setTitle('BusyPang — Help & Commands')
        .setColor(0x00b3ff)
        .setDescription([
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
          '`/warnlist` — Show all users with warnings'
        ].join('\n'));
      return interaction.reply({ embeds: [emb] });
    }

    // /warnings
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      // anyone can check themselves; checking others is allowed but only admins will *mutate* elsewhere
      const count = warnings.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warning(s).` });
    }

    // /warn (admin)
    if (cmd === 'warn') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const current = warnings.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnings.set(user.id, next);

      await interaction.reply(`⚠️ Warned **${user.tag}** — now **${next}/3**. 📝 ${reason}`);
      log(guild, `⚠️ **${interaction.user.tag}** warned **<@${user.id}>** — ${next}/3. 📝 ${reason}`);

      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (${reason})` });
          log(guild, `🚫 Auto-banned **<@${user.id}>** at 3 warnings.`);
        } catch {
          log(guild, `⚠️ Could not auto-ban **<@${user.id}>** — check role/permissions.`);
        }
      }
      return;
    }

    // /clearwarns (admin)
    if (cmd === 'clearwarns') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warnings cleared by ${interaction.user.tag}`;
      warnings.set(user.id, 0);
      await interaction.reply(`🧹 Cleared warnings for **${user.tag}**. 📝 ${reason}`);
      log(guild, `🧹 **${interaction.user.tag}** cleared warnings for **<@${user.id}>**. 📝 ${reason}`);
      return;
    }

    // /ban (admin)
    if (cmd === 'ban') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        await interaction.reply(`🚫 Banned **${user.tag}**. 📝 ${reason}`);
        log(guild, `🚫 **${interaction.user.tag}** banned **<@${user.id}>**. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not ban this user — check the bot’s role is above theirs.' });
      }
      return;
    }

    // /pardon (admin)
    if (cmd === 'pardon') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Pardon issued by ${interaction.user.tag}`;
      bannedUsers.delete(user.id);
      warnings.set(user.id, 0);
      try {
        await guild.bans.remove(user.id, reason);
        await interaction.reply(`✅ Pardoned **${user.tag}**. 📝 ${reason}`);
        log(guild, `✅ **${interaction.user.tag}** pardoned **<@${user.id}>**. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    // /banlist (admin)
    if (cmd === 'banlist') {
      if (bannedUsers.size === 0) return interaction.reply({ content: '📋 No users in the lifetime ban list.' });
      const ids = [...bannedUsers];
      const lines = [];
      for (const id of ids) {
        try {
          const u = await client.users.fetch(id);
          lines.push(`• **${u.tag}** (<@${id}>)`);
        } catch {
          lines.push(`• (unknown user) (<@${id}>)`);
        }
      }
      const chunks = [];
      let buf = '📋 **Lifetime Ban List**\n';
      for (const line of lines) {
        if ((buf + line + '\n').length > 1900) { chunks.push(buf); buf = ''; }
        buf += line + '\n';
      }
      if (buf) chunks.push(buf);
      for (const c of chunks) await interaction.reply({ content: c }).catch(async () => await interaction.followUp({ content: c }));
      return;
    }

    // /warnlist (admin)
    if (cmd === 'warnlist') {
      const entries = [...warnings.entries()].filter(([, count]) => (count || 0) > 0);
      if (entries.length === 0) return interaction.reply({ content: '🧾 No active warnings.' });

      // Build mapping ID->count
      const list = [];
      for (const [id, count] of entries) {
        try {
          const u = await client.users.fetch(id);
          list.push({ id, tag: u.tag, count });
        } catch {
          list.push({ id, tag: 'unknown', count });
        }
      }
      list.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

      const lines = list.map(x => `• **${x.tag}** (<@${x.id}>) — ${x.count}/3`);
      const chunks = [];
      let buf = '🧾 **Warning List**\n';
      for (const line of lines) {
        if ((buf + line + '\n').length > 1900) { chunks.push(buf); buf = ''; }
        buf += line + '\n';
      }
      if (buf) chunks.push(buf);
      for (const c of chunks) await interaction.reply({ content: c }).catch(async () => await interaction.followUp({ content: c }));
      return;
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ Unexpected error. Try again.' }).catch(() => {});
    }
  }
});

client.login(TOKEN);