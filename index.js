// BusyPang / Gatekeeper — runtime (public replies; no dotenv needed)
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const express = require('express');

// ===== Environment (Railway variables) =====
const TOKEN       = process.env.DISCORD_TOKEN;
const LOG_CHANNEL = process.env.LOG_CHANNEL; // channel ID where logs should be posted

// ===== Keepalive for Railway =====
const app = express();
app.get('/', (_req, res) => res.send('BusyPang is running.'));
app.listen(3000, () => console.log('✅ Web server running on port 3000'));

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
});

// ===== State =====
const bannedUsers = new Set();        // lifetime ban IDs (cache; synced with API)
global.warningsByGuild = new Map();   // Map<guildId, Map<userId, count>>

// admin-only commands (slash names)
const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'warnlist', 'clearwarns']);
const isAdmin = (i) => i.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

// ---- helpers ----
const log = (guild, content) => {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch) ch.send({ content }).catch(() => {});
};
const getGuildWarnings = (gid) => {
  let m = global.warningsByGuild.get(gid);
  if (!m) { m = new Map(); global.warningsByGuild.set(gid, m); }
  return m;
};

// ===== Pagination utilities =====
function slicePage(items, page, perPage) {
  const start = page * perPage;
  return items.slice(start, start + perPage);
}
function pageEmbed({ title, lines, page, perPage, color = 0xffc107 }) {
  const totalPages = Math.max(1, Math.ceil(lines.length / perPage));
  const desc = slicePage(lines, page, perPage).join('\n') || '_No entries._';
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(color)
    .setFooter({ text: `Page ${page + 1}/${totalPages} • total ${lines.length}` });
}
function controlsRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pg_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('pg_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('pg_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('pg_close').setLabel('✖ Close').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}
/**
 * Public paginator. Only the invoker can press the controls.
 * supplier: async () => string[]  (called again on Refresh)
 */
async function sendPaginator(interaction, { title, perPage = 15, color, supplier, guardUserId }) {
  let page = 0;
  let lines = await supplier();

  const msg = await interaction.reply({
    embeds: [pageEmbed({ title, lines, page, perPage, color })],
    components: [controlsRow()],
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 2 * 60 * 1000, // 2 minutes
  });

  collector.on('collect', async (btn) => {
    if (btn.user.id !== guardUserId) {
      return btn.reply({ content: '⚠️ Only the command invoker can use these controls.', ephemeral: true });
    }
    try {
      if (btn.customId === 'pg_prev') page = Math.max(0, page - 1);
      if (btn.customId === 'pg_next') {
        const totalPages = Math.max(1, Math.ceil(lines.length / perPage));
        page = Math.min(totalPages - 1, page + 1);
      }
      if (btn.customId === 'pg_refresh') {
        lines = await supplier();
        const totalPages = Math.max(1, Math.ceil(lines.length / perPage));
        if (page > totalPages - 1) page = totalPages - 1;
      }
      if (btn.customId === 'pg_close') {
        collector.stop('closed');
        return btn.update({ components: [controlsRow(true)] });
      }
      await btn.update({
        embeds: [pageEmbed({ title, lines, page, perPage, color })],
        components: [controlsRow()],
      });
    } catch (e) {
      console.error(e);
      try { await btn.reply({ content: '❌ Error updating panel.', ephemeral: true }); } catch {}
    }
  });

  collector.on('end', async () => {
    try { await msg.edit({ components: [controlsRow(true)] }); } catch {}
  });
}

// ===== Boot / Sync bans =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch();
      for (const [id] of bans) bannedUsers.add(id);
      console.log(`🔄 Synced ${bans.size} bans for ${guild.name}`);
    } catch (e) {
      console.log(`⚠️ Failed to fetch bans for ${guild.name}:`, e?.message || e);
    }
  }
});

// keep cache in sync
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// auto-ban if a banned user rejoins
client.on('guildMemberAdd', async (member) => {
  const g = member.guild;
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

// when a member leaves → perma-ban
client.on('guildMemberRemove', async (member) => {
  const g = member.guild;
  bannedUsers.add(member.id);
  log(g, `❌ **${member.user.tag}** left the server — banning for life...`);
  try {
    await g.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch (e) {
    log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
  }
});

// ===== Slash command runtime =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { guild, commandName: cmd } = interaction;

  // show commands to everyone, but restrict execution of admin ones
  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({ content: '⚠️ You must be an **Admin** to use this command.' });
  }

  try {
    // --- HELP ---
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
            '`/banlist` — Show lifetime ban list (paged)',
            '`/warnlist` — Show warning list (paged)',
          ].join('\n')
        );
      return interaction.reply({ embeds: [emb] });
    }

    // --- CHECK OWN/OTHERS WARNINGS (public reply) ---
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warning(s).` });
    }

    // --- WARN (admin) ---
    if (cmd === 'warn') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);
      const current = warnMap.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnMap.set(user.id, next);

      await interaction.reply(`⚠️ Warned **${user.tag}** — now at **${next}/3**. Reason: ${reason}`);
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

    // --- CLEAR WARNS (admin) ---
    if (cmd === 'clearwarns') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warnings cleared by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);
      warnMap.set(user.id, 0);
      await interaction.reply(`🧹 Cleared warnings for **${user.tag}**. 📝 ${reason}`);
      log(guild, `🧹 **${interaction.user.tag}** cleared warnings for **<@${user.id}>**. 📝 ${reason}`);
      return;
    }

    // --- BAN (admin) ---
    if (cmd === 'ban') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        await interaction.reply(`🚫 Banned **${user.tag}**. 📝 ${reason}`);
        log(guild, `🚫 **${interaction.user.tag}** banned **<@${user.id}>**. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not ban that user — check the bot’s role is above theirs.' });
      }
      return;
    }

    // --- PARDON (admin) ---
    if (cmd === 'pardon') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Pardon issued by ${interaction.user.tag}`;
      bannedUsers.delete(user.id);
      const warnMap = getGuildWarnings(guild.id);
      warnMap.set(user.id, 0);
      try {
        await guild.bans.remove(user.id, reason);
        await interaction.reply(`✅ Pardoned **${user.tag}**. 📝 ${reason}`);
        log(guild, `✅ **${interaction.user.tag}** pardoned **<@${user.id}>**. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    // --- BANLIST (admin, paginated) ---
    if (cmd === 'banlist') {
      const supplier = async () => {
        const bans = await guild.bans.fetch();
        const ids = [...bans.keys()];
        const lines = [];
        for (const id of ids) {
          try {
            const u = await client.users.fetch(id);
            const tag = u?.tag ?? 'unknown';
            lines.push(`• **${tag}** (<@${id}>)`);
          } catch {
            lines.push(`• (unknown) (<@${id}>)`);
          }
        }
        return lines.sort((a, b) => a.localeCompare(b, 'en'));
      };
      return sendPaginator(interaction, {
        title: '📕 Lifetime Ban List',
        perPage: 15,
        color: 0xffc107,
        supplier,
        guardUserId: interaction.user.id,
      });
    }

    // --- WARNLIST (admin, paginated) ---
    if (cmd === 'warnlist') {
      const supplier = async () => {
        const warnMap = getGuildWarnings(guild.id); // Map<userId, count>
        const entries = [...warnMap.entries()].filter(([, c]) => c > 0);
        const lines = [];
        for (const [id, count] of entries) {
          try {
            const u = await client.users.fetch(id);
            const tag = u?.tag ?? 'unknown';
            lines.push(`• **${tag}** — ${count}/3 (<@${id}>)`);
          } catch {
            lines.push(`• (unknown) — ${count}/3 (<@${id}>)`);
          }
        }
        // sort by count desc then name
        return lines.sort((a, b) => {
          const an = Number(a.match(/— (\d)/)?.[1] ?? 0);
          const bn = Number(b.match(/— (\d)/)?.[1] ?? 0);
          if (bn !== an) return bn - an;
          return a.localeCompare(b, 'en');
        });
      };
      return sendPaginator(interaction, {
        title: '🧾 Warning List',
        perPage: 15,
        color: 0x00b3ff,
        supplier,
        guardUserId: interaction.user.id,
      });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ Unexpected error. Try again.' }).catch(() => {});
    }
  }
});

client.login(TOKEN);