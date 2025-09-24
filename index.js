// BusyPang — Runtime (non-ephemeral replies; everyone can see responses)
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const express = require('express');

const TOKEN       = process.env.DISCORD_TOKEN; // REQUIRED
const LOG_CHANNEL = process.env.LOG_CHANNEL;   // REQUIRED (channel ID)

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

// In-memory state (reset on restart — use DB if you need persistence)
const bannedUsers = new Set(); // lifetime ban IDs
const warnings    = new Map(); // Map<userId, count>

const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'clearwarns', 'warnlist']);
const isAdmin = (i) => i.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
const NO_PING = { allowedMentions: { parse: [], users: [] } };

// --- helpers ---
const PAGE_SIZE_BAN  = 15;
const PAGE_SIZE_WARN = 10;

const log = (guild, content) => {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch) ch.send({ content, ...NO_PING }).catch(() => {});
};

const makePages = (items, perPage, lineBuilder) => {
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) {
    const slice = items.slice(i, i + perPage);
    const lines = slice.map(lineBuilder);
    pages.push(lines.join('\n') || '(no entries)');
  }
  return pages.length ? pages : ['(no entries)'];
};

const makeEmbed = ({ title, desc, color = 0xffbf00, footer }) => {
  const emb = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color);
  if (footer) emb.setFooter(footer);
  return emb;
};

const makeRow = (ids, disabled = {}) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ids.prev).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(!!disabled.prev),
    new ButtonBuilder().setCustomId(ids.next).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(!!disabled.next),
    new ButtonBuilder().setCustomId(ids.refresh).setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(ids.close).setLabel('✖ Close').setStyle(ButtonStyle.Danger),
  );

// --- ready + initial sync ---
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch();
      bannedUsers.clear();
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

// autoban if banned user rejoins
client.on('guildMemberAdd', async (member) => {
  const g = member.guild;
  if (bannedUsers.has(member.id)) {
    try {
      await g.members.ban(member.id, { reason: 'Rejoined after leaving (lifetime ban)' });
      log(g, `🚫 **${member.user.tag}** tried to rejoin and was banned.`);
    } catch {
      log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
    }
  } else {
    log(g, `✅ **${member.user.tag}** joined the server.`);
  }
});

// leave → lifetime ban
client.on('guildMemberRemove', async (member) => {
  const g = member.guild;
  bannedUsers.add(member.id);
  log(g, `❌ **${member.user.tag}** left the server — banning for life...`);
  try {
    await g.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch {
    log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
  }
});

// --- Slash commands runtime ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { guild, commandName: cmd } = interaction;

  // everyone can see; only admins can execute admin commands
  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({ content: '⚠️ You must be an **Admin** to use this command.' });
  }

  try {
    // /bb — help
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
            '`/warnlist` — Show all users with warnings (paged)',
          ].join('\n')
        );
      return interaction.reply({ embeds: [emb] });
    }

    // /warnings — NOW: anyone can check any member (or self if omitted)
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const count = warnings.get(target.id) || 0;
      return interaction.reply({ content: `🧾 Warnings for <@${target.id}>: **${count}/3**` });
    }

    // /warn — admin
    if (cmd === 'warn') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const current = warnings.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnings.set(user.id, next);

      await interaction.reply({ content: `⚠️ <@${user.id}> warned — now **${next}/3**. 📝 ${reason}` });
      log(guild, `⚠️ **${interaction.user.tag}** warned <@${user.id}> — ${next}/3. 📝 ${reason}`);

      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (${reason})` });
          log(guild, `🚫 Auto-banned <@${user.id}> at 3 warnings.`);
        } catch {
          log(guild, `⚠️ Could not auto-ban **${user.id}** — check role/permissions.`);
        }
      }
      return;
    }

    // /clearwarns — admin
    if (cmd === 'clearwarns') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warnings cleared by ${interaction.user.tag}`;
      warnings.set(user.id, 0);
      await interaction.reply({ content: `🧹 Cleared warnings for <@${user.id}>. 📝 ${reason}` });
      log(guild, `🧹 **${interaction.user.tag}** cleared warnings for <@${user.id}>. 📝 ${reason}`);
      return;
    }

    // /ban — admin
    if (cmd === 'ban') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        await interaction.reply({ content: `🚫 Banned **${user.tag}** (${user.id}). 📝 ${reason}` });
        log(guild, `🚫 **${interaction.user.tag}** banned **${user.tag}** (${user.id}). 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not ban that user (role/permissions?).' });
      }
      return;
    }

    // /pardon — admin
    if (cmd === 'pardon') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Pardoned by ${interaction.user.tag}`;
      bannedUsers.delete(user.id);
      warnings.set(user.id, 0);
      try {
        await guild.bans.remove(user.id, reason);
        await interaction.reply({ content: `✅ <@${user.id}> has been pardoned. 📝 ${reason}` });
        log(guild, `✅ **${interaction.user.tag}** pardoned <@${user.id}>. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    // /banlist — admin, paginated
    if (cmd === 'banlist') {
      const bans = await guild.bans.fetch();
      const banData = [];
      bannedUsers.clear();
      for (const [, entry] of bans) {
        bannedUsers.add(entry.user.id);
        banData.push({ id: entry.user.id, tag: entry.user?.tag || '(unknown)' });
      }
      if (banData.length === 0) return interaction.reply({ content: '📋 No users in the lifetime ban list.' });

      let pages = makePages(banData, PAGE_SIZE_BAN, (u) => `• <@${u.id}> — **${u.tag}** (${u.id})`);
      let page = 0;
      const ids = { prev: 'ban_prev', next: 'ban_next', refresh: 'ban_refresh', close: 'ban_close' };

      const msg = await interaction.reply({
        embeds: [makeEmbed({ title: '📋 Lifetime Ban List', desc: pages[page], footer: { text: `Page ${page+1}/${pages.length} • ${banData.length} total` } })],
        components: [makeRow(ids, { prev: page === 0, next: page === pages.length - 1 })],
        ...NO_PING,
      });

      const collector = msg.createMessageComponentCollector({
        time: 120_000,
        filter: (btn) => btn.user.id === interaction.user.id
      });

      collector.on('collect', async (btn) => {
        try {
          if (btn.customId === ids.prev) page = Math.max(0, page - 1);
          else if (btn.customId === ids.next) page = Math.min(pages.length - 1, page + 1);
          else if (btn.customId === ids.refresh) {
            const fresh = await guild.bans.fetch();
            const freshData = [];
            bannedUsers.clear();
            for (const [, e] of fresh) {
              bannedUsers.add(e.user.id);
              freshData.push({ id: e.user.id, tag: e.user?.tag || '(unknown)' });
            }
            pages = makePages(freshData, PAGE_SIZE_BAN, (u) => `• <@${u.id}> — **${u.tag}** (${u.id})`);
            page = Math.min(page, pages.length - 1);
          } else if (btn.customId === ids.close) {
            collector.stop('closed');
            return btn.update({ components: [] });
          }

          await btn.update({
            embeds: [makeEmbed({ title: '📋 Lifetime Ban List', desc: pages[page], footer: { text: `Page ${page+1}/${pages.length} • ${bannedUsers.size} total` } })],
            components: [makeRow(ids, { prev: page === 0, next: page === pages.length - 1 })],
            ...NO_PING,
          });
        } catch {}
      });

      collector.on('end', async () => { try { await msg.edit({ components: [] }); } catch {} });
      return;
    }

    // /warnlist — admin, paginated
    if (cmd === 'warnlist') {
      const entries = [...warnings.entries()]
        .filter(([, count]) => (count || 0) > 0)
        .map(([id, count]) => ({ id, count }));
      if (entries.length === 0) return interaction.reply({ content: '🧾 No members currently have warnings.' });

      const data = [];
      for (const e of entries) {
        try {
          const u = await client.users.fetch(e.id);
          data.push({ id: e.id, tag: u?.tag || '(unknown)', count: e.count });
        } catch {
          data.push({ id: e.id, tag: '(unknown)', count: e.count });
        }
      }
      data.sort((a, b) => b.count - a.count);

      let pages = makePages(data, PAGE_SIZE_WARN, (u) => `• <@${u.id}> — **${u.count}/3** (${u.tag}, ${u.id})`);
      let page = 0;
      const ids = { prev: 'wprev', next: 'wnext', refresh: 'wrefresh', close: 'wclose' };

      const msg = await interaction.reply({
        embeds: [makeEmbed({ title: '⚠️ Current Warnings', desc: pages[page], color: 0xff4444, footer: { text: `Page ${page+1}/${pages.length} • ${data.length} members` } })],
        components: [makeRow(ids, { prev: page === 0, next: page === pages.length - 1 })],
        ...NO_PING,
      });

      const collector = msg.createMessageComponentCollector({
        time: 120_000,
        filter: (btn) => btn.user.id === interaction.user.id
      });

      collector.on('collect', async (btn) => {
        try {
          if (btn.customId === ids.prev) page = Math.max(0, page - 1);
          else if (btn.customId === ids.next) page = Math.min(pages.length - 1, page + 1);
          else if (btn.customId === ids.refresh) {
            const refreshed = [...warnings.entries()]
              .filter(([, count]) => (count || 0) > 0)
              .map(([id, count]) => ({ id, count }));
            const refData = [];
            for (const e of refreshed) {
              try {
                const u = await client.users.fetch(e.id);
                refData.push({ id: e.id, tag: u?.tag || '(unknown)', count: e.count });
              } catch {
                refData.push({ id: e.id, tag: '(unknown)', count: e.count });
              }
            }
            refData.sort((a, b) => b.count - a.count);
            pages = makePages(refData, PAGE_SIZE_WARN, (u) => `• <@${u.id}> — **${u.count}/3** (${u.tag}, ${u.id})`);
            page = Math.min(page, pages.length - 1);
          } else if (btn.customId === ids.close) {
            collector.stop('closed');
            return btn.update({ components: [] });
          }

          await btn.update({
            embeds: [makeEmbed({ title: '⚠️ Current Warnings', desc: pages[page], color: 0xff4444, footer: { text: `Page ${page+1}/${pages.length}` } })],
            components: [makeRow(ids, { prev: page === 0, next: page === pages.length - 1 })],
            ...NO_PING,
          });
        } catch {}
      });

      collector.on('end', async () => { try { await msg.edit({ components: [] }); } catch {} });
      return;
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) interaction.reply({ content: '❌ Unexpected error. Try again.' }).catch(() => {});
  }
});

if (!TOKEN || !LOG_CHANNEL) {
  console.error('❌ Missing DISCORD_TOKEN or LOG_CHANNEL env vars.');
  process.exit(1);
}
client.login(TOKEN);