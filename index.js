// index.js
// BusyPang / Gatekeeper Bot — Moderation + Region Leaderboard + Keyword Blocker
// Version v1.7 (cleaned & fixed)

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
const fs = require('fs');
const path = require('path');

// ===== Environment =====
const TOKEN         = process.env.DISCORD_TOKEN;
const LOG_CHANNEL   = process.env.LOG_CHANNEL;
const STATS_CHANNEL = process.env.STATS_CHANNEL;
const RULES_LINK    = process.env.RULES_LINK || '';
const FORCE_FETCH_MEMBERS = (process.env.FORCE_FETCH_MEMBERS || 'false').toLowerCase() === 'true';

if (!TOKEN || !LOG_CHANNEL || !STATS_CHANNEL) {
  console.error('❌ Missing environment variables. Make sure DISCORD_TOKEN, LOG_CHANNEL and STATS_CHANNEL are set.');
  process.exit(1);
}

// ===== Keepalive (Railway) =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🟢 BusyPang is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

// ===== State =====
const bannedUsers = new Set();                 // global lifetime ban cache
const warningsByGuild = new Map();             // Map<guildId, Map<userId, count>>
const ADMIN_CMDS = new Set(['warn','ban','pardon','banlist','warnlist','clearwarns','addkeyword','removekeyword','listkeywords']);
const isAdmin = (interactionOrMember) => {
  // interaction -> has memberPermissions, otherwise fallback
  try {
    return (interactionOrMember.memberPermissions && interactionOrMember.memberPermissions.has(PermissionsBitField.Flags.Administrator))
      || (interactionOrMember.member && interactionOrMember.member.permissions && interactionOrMember.member.permissions.has && interactionOrMember.member.permissions.has(PermissionsBitField.Flags.Administrator))
      || false;
  } catch { return false; }
};

// ===== Helpers =====
const log = (guild, content) => {
  try {
    const ch = guild.channels.cache.get(LOG_CHANNEL);
    if (ch) ch.send({ content }).catch(() => {});
  } catch {}
};
const getGuildWarnings = (gid) => {
  let m = warningsByGuild.get(gid);
  if (!m) { m = new Map(); warningsByGuild.set(gid, m); }
  return m;
};

// ===== Region Roles (from env) =====
// Set ROLE_ID_1 ... ROLE_ID_15 in Railway env to actual role IDs
const REGION_ROLES = {
  [process.env.ROLE_ID_1]: ":house_with_garden: NEGERI SEMBILAN",
  [process.env.ROLE_ID_2]: ":hot_pepper: KELANTAN",
  [process.env.ROLE_ID_3]: ":park: PERAK",
  [process.env.ROLE_ID_4]: ":elephant: PAHANG",
  [process.env.ROLE_ID_5]: ":cityscape: SELANGOR",
  [process.env.ROLE_ID_6]: ":ear_of_rice: KEDAH",
  [process.env.ROLE_ID_7]: ":turtle: TERENGGANU",
  [process.env.ROLE_ID_8]: ":lion_face: JOHOR",
  [process.env.ROLE_ID_9]: ":grapes: PERLIS",
  [process.env.ROLE_ID_10]: ":palm_tree: PENANG",
  [process.env.ROLE_ID_11]: ":anchor: MALACCA",
  [process.env.ROLE_ID_12]: ":orangutan: SARAWAK",
  [process.env.ROLE_ID_13]: ":mountain_snow: SABAH",
  [process.env.ROLE_ID_14]: ":mosque: FEDERAL TERRITORY (KL/PUTRAJAYA/LABUAN)",
  [process.env.ROLE_ID_15]: ":globe_with_meridians: OTHERS",
};

// timezone helper (Malaysia MYT, 12-hour)
function formatMYTTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  }).format(date);
}

// Build region embed with counts
function buildRegionEmbed(guild) {
  const regionData = Object.entries(REGION_ROLES).map(([id, label]) => {
    const role = guild.roles.cache.get(id);
    return { label, count: role ? role.members.size : 0 };
  }).sort((a,b) => b.count - a.count);

  const medals = ["🏆","🥈","🥉"];
  const lines = regionData.map((r,i) => `${medals[i] || `#${i+1}`} **${r.label}** — ${r.count} member(s)`);
  return new EmbedBuilder()
    .setTitle("🌐 Malaysia Region Leaderboard")
    .setDescription(lines.join('\n') || '_No region roles found._')
    .setColor(0x2ecc71)
    .setFooter({ text: `Last updated: ${formatMYTTime(new Date())}` })
    .setTimestamp();
}

// update region stats message in the configured stats channel
async function updateRegionStats(guild) {
  try {
    if (FORCE_FETCH_MEMBERS) {
      // careful: this fetches all members — only enable if acceptable for your guild
      await guild.members.fetch().catch(() => {});
    }
    const channel = guild.channels.cache.get(STATS_CHANNEL);
    if (!channel) return;
    const embed = buildRegionEmbed(guild);
    const messages = await channel.messages.fetch({ limit: 10 }).catch(() => []);
    const botMsg = messages.find(m => m.author && m.author.id === client.user.id);
    if (botMsg) {
      await botMsg.edit({ embeds: [embed] }).catch(() => {});
    } else {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to updateRegionStats:', err);
  }
}

// ===== Keyword Moderation (file-based) =====
const keywordsFile = path.join(__dirname, 'keywords.json');
if (!fs.existsSync(keywordsFile)) fs.writeFileSync(keywordsFile, JSON.stringify([]));
const loadKeywords = () => {
  try { return JSON.parse(fs.readFileSync(keywordsFile, 'utf8') || '[]'); } catch { return []; }
};
const saveKeywords = (arr) => fs.writeFileSync(keywordsFile, JSON.stringify(arr, null, 2));

// delete and mention + moderator log when blocked keyword found
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const keywords = loadKeywords();
    if (!keywords.length) return;
    const content = (message.content || '').toLowerCase();
    const found = keywords.find(k => k && content.includes(k.toLowerCase()));
    if (found) {
      await message.delete().catch(() => {});
      await message.channel.send({ content: `🚫 <@${message.author.id}>, your message contained a blocked keyword (\`${found}\`).` }).catch(() => {});
      // log
      if (message.guild) log(message.guild, `🛡️ Blocked message by <@${message.author.id}> in #${message.channel.name} — matched keyword: \`${found}\``);
    }
  } catch (e) {
    console.error('messageCreate handler error', e);
  }
});

// ===== Activity Randomizer =====
function setRandomPresence() {
  const activities = [
    { type: 0, name: 'I am BusyBot | /bb' },      // Playing
    { type: 3, name: "you'all 👀" },              // Watching
    { type: 2, name: '/commands 🎶' },            // Listening
  ];
  const a = activities[Math.floor(Math.random() * activities.length)];
  try {
    client.user.setPresence({ activities: [{ name: a.name, type: a.type }], status: 'online' });
  } catch (e) { console.error('setPresence failed', e); }
}

// ===== Boot / Sync =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // sync bans for all guilds on startup
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch().catch(() => new Map());
      for (const [id] of bans) bannedUsers.add(id);
      console.log(`🔄 Synced ${bans.size || 0} bans for ${guild.name}`);
    } catch (e) {
      console.warn('Failed to sync bans for', guild?.name, e?.message || e);
    }
  }

  // presence
  setRandomPresence();
  setInterval(setRandomPresence, 10 * 60 * 1000);

  // initial region stats + periodic update
  const guild = client.guilds.cache.first();
  if (guild) {
    await updateRegionStats(guild);
    setInterval(() => updateRegionStats(guild), 5 * 60 * 1000); // refresh every 5 minutes
  }
});

// update region stats on role/membership changes (incremental)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const regionRoleIds = Object.keys(REGION_ROLES).filter(Boolean);
    const changed = regionRoleIds.some(rid => oldMember.roles.cache.has(rid) !== newMember.roles.cache.has(rid));
    if (changed) await updateRegionStats(newMember.guild);
  } catch (e) { console.error('guildMemberUpdate error', e); }
});
client.on('guildMemberAdd', async (m) => { try { await updateRegionStats(m.guild); } catch {} });
client.on('guildMemberRemove', async (m) => { try { await updateRegionStats(m.guild); } catch {} });
client.on('roleDelete', async (role) => { try { await updateRegionStats(role.guild); } catch {} });

// ===== Slash Command Handler =====
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, guild } = interaction;
    if (!guild) return interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });

    // Admin-only guard for admin commands
    if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
      return interaction.reply({ content: '⛔ You must be an Admin to run this command.', ephemeral: true });
    }

    // Keyword management
    if (cmd === 'addkeyword') {
      const word = interaction.options.getString('word').toLowerCase();
      const arr = loadKeywords();
      if (arr.includes(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` already exists.`, ephemeral: true });
      arr.push(word); saveKeywords(arr);
      return interaction.reply({ content: `✅ Added keyword: \`${word}\``, ephemeral: true });
    }
    if (cmd === 'removekeyword') {
      const word = interaction.options.getString('word').toLowerCase();
      let arr = loadKeywords();
      if (!arr.includes(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` not found.`, ephemeral: true });
      arr = arr.filter(x => x !== word); saveKeywords(arr);
      return interaction.reply({ content: `✅ Removed keyword: \`${word}\``, ephemeral: true });
    }
    if (cmd === 'listkeywords') {
      const arr = loadKeywords();
      if (!arr.length) return interaction.reply({ content: `🚫 No blocked keywords.`, ephemeral: true });
      return interaction.reply({ content: `🛡️ Blocked keywords:\n\`\`\`${arr.join(', ')}\`\`\``, ephemeral: true });
    }

    // regions (public)
    if (cmd === 'regions') {
      const embed = buildRegionEmbed(guild);
      return interaction.reply({ embeds: [embed] });
    }

    // help / bb
    if (cmd === 'bb') {
      const emb = new EmbedBuilder()
        .setTitle('🤖 BusyPang — Help & Commands')
        .setColor(0x00b3ff)
        .setDescription([
          '### 👥 Everyone',
          '`/warnings [member]` — Check warnings (yourself or another)',
          '`/regions` — Show region leaderboard',
          '`/bb` — Show this help',
          '',
          '### 🛡️ Admin only',
          '`/warn @member [reason]` — Add warning (3 = auto-ban)',
          '`/clearwarns @member` — Reset warnings',
          '`/ban @member [reason]` — Ban immediately',
          '`/pardon user_id` — Unban by ID & reset warnings',
          '`/banlist` — Show ban list',
          '`/warnlist` — Show warning list',
          '',
          '### 🪄 Keywords',
          '`/addkeyword word` — Add blocked word',
          '`/removekeyword word` — Remove blocked word',
          '`/listkeywords` — Show all keywords',
        ].join('\n'));
      return interaction.reply({ embeds: [emb] });
    }

    // warnings (public checking)
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warnings.` });
    }

    // warn (admin)
    if (cmd === 'warn') {
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);
      const current = warnMap.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnMap.set(user.id, next);

      // DM embed to user
      try {
        const dm = new EmbedBuilder()
          .setTitle('⚠️ You have received a warning')
          .setDescription(`You have received a warning in **${guild.name}**.`)
          .addFields(
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: `${reason}`, inline: false },
            { name: 'Warning Count', value: `${next}/3`, inline: true },
          )
          .setFooter({ text: RULES_LINK ? 'Please review the server rules.' : '' })
          .setTimestamp();
        if (RULES_LINK) dm.addFields({ name: '📜 Rules', value: `[View rules](${RULES_LINK})`, inline: false });
        await user.send({ embeds: [dm] }).catch(() => {});
      } catch {}

      await interaction.reply({ content: `⚠️ Warned **${user.tag}** — now at **${next}/3**. 📝 ${reason}` });
      log(guild, `⚠️ ${interaction.user.tag} warned ${user.tag} — ${next}/3 — ${reason}`);

      // auto-ban at 3
      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (by ${interaction.user.tag})` });
          // DM about ban
          try {
            const banDM = new EmbedBuilder()
              .setTitle('🚫 You have been banned')
              .setDescription(`You have been **banned** from **${guild.name}**.`)
              .addFields(
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                { name: 'Reason', value: `3 warnings — last: ${reason}`, inline: false },
                { name: 'Type', value: 'Lifetime ban', inline: true },
              )
              .setTimestamp();
            if (RULES_LINK) banDM.addFields({ name: '📜 Rules', value: `[View rules](${RULES_LINK})`, inline: false });
            await user.send({ embeds: [banDM] }).catch(() => {});
          } catch {}
          await interaction.followUp({ content: `🚫 **${user.tag}** reached 3/3 warnings and was banned for life.` });
          log(guild, `🚫 Auto-banned ${user.tag} at 3 warnings (by ${interaction.user.tag}).`);
        } catch (e) {
          console.error('Auto-ban error', e);
          await interaction.followUp({ content: `⚠️ Reached 3 warnings but could not ban ${user.tag}. Check my role/permissions.` });
          log(guild, `⚠️ Could not auto-ban ${user.tag} at 3 warnings — role/permission issue.`);
        }
      }
      return;
    }

    // clearwarns (admin)
    if (cmd === 'clearwarns') {
      const user = interaction.options.getUser('member');
      const warnMap = getGuildWarnings(guild.id);
      warnMap.set(user.id, 0);
      await interaction.reply({ content: `🧹 Cleared warnings for **${user.tag}**.` });
      log(guild, `🧹 ${interaction.user.tag} cleared warnings for ${user.tag}.`);
      return;
    }

    // ban (admin)
    if (cmd === 'ban') {
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        // DM to user
        try {
          const banDM = new EmbedBuilder()
            .setTitle('🚫 You have been banned')
            .setDescription(`You have been **banned** from **${guild.name}**.`)
            .addFields(
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: reason, inline: false },
              { name: 'Type', value: 'Lifetime ban', inline: true },
            )
            .setTimestamp();
          if (RULES_LINK) banDM.addFields({ name: '📜 Rules', value: `[View rules](${RULES_LINK})`, inline: false });
          await user.send({ embeds: [banDM] }).catch(() => {});
        } catch {}
        await interaction.reply({ content: `🚫 Banned **${user.tag}**. 📝 ${reason}` });
        log(guild, `🚫 ${interaction.user.tag} banned ${user.tag} — ${reason}`);
      } catch (e) {
        console.error('ban error', e);
        await interaction.reply({ content: '⚠️ Could not ban that user — check my role position & permissions.' });
      }
      return;
    }

    // pardon (admin) — unban by user ID (works even if user not in server)
    if (cmd === 'pardon') {
      const userId = interaction.options.getString('user_id');
      const reason = interaction.options.getString('reason') || `Pardon by ${interaction.user.tag}`;
      bannedUsers.delete(userId);
      getGuildWarnings(guild.id).set(userId, 0);
      try {
        await guild.bans.remove(userId, reason);
        // try fetch tag
        let tag = userId;
        try { const u = await client.users.fetch(userId); tag = u.tag || userId; } catch {}
        await interaction.reply({ content: `✅ Pardoned **<@${userId}>** (${tag}). 📝 ${reason}` });
        log(guild, `✅ ${interaction.user.tag} pardoned ${userId} (${tag}) — ${reason}`);
      } catch (e) {
        console.error('pardon error', e);
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    // banlist (admin)
    if (cmd === 'banlist') {
      const bans = await guild.bans.fetch();
      const lines = [];
      for (const [id, b] of bans) {
        lines.push(`• **${b.user.tag}** (<@${id}>)`);
      }
      const embed = new EmbedBuilder()
        .setTitle('📕 Lifetime Ban List')
        .setDescription(lines.join('\n') || '_No bans._')
        .setColor(0xff0000);
      return interaction.reply({ embeds: [embed] });
    }

    // warnlist (admin)
    if (cmd === 'warnlist') {
      const warnMap = getGuildWarnings(guild.id);
      const entries = [...warnMap.entries()].filter(([,c]) => c > 0);
      const lines = [];
      for (const [id, count] of entries) {
        let tag = id;
        try { const u = await client.users.fetch(id); tag = u.tag; } catch {}
        lines.push(`• **${tag}** — ${count}/3 (<@${id}>)`);
      }
      const embed = new EmbedBuilder()
        .setTitle('🧾 Warning List')
        .setDescription(lines.join('\n') || '_No warnings._')
        .setColor(0xffc107);
      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('interaction handler error', err);
    if (!interaction.replied) interaction.reply({ content: '❌ Unexpected error. Try again later.', ephemeral: true }).catch(()=>{});
  }
});

// ===== Ban handlers keep cache in sync =====
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// ===== Safety listeners =====
client.on('error', console.error);
client.on('shardError', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// ===== Start =====
client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});