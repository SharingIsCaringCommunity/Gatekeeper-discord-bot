// index.js
// BusyPang / Gatekeeper Bot — Moderation + Region Leaderboard + Keyword Blocker
// Final consolidated version

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===== Environment =====
const TOKEN         = process.env.DISCORD_TOKEN;
const LOG_CHANNEL   = process.env.LOG_CHANNEL;   // channel id for join/leave & mod logs
const STATS_CHANNEL = process.env.STATS_CHANNEL; // channel id to post region leaderboard
const RULES_LINK    = process.env.RULES_LINK || '';
const FORCE_FETCH_MEMBERS = (process.env.FORCE_FETCH_MEMBERS || 'false').toLowerCase() === 'true';

if (!TOKEN || !LOG_CHANNEL || !STATS_CHANNEL) {
  console.error('❌ Missing environment variables. Make sure DISCORD_TOKEN, LOG_CHANNEL and STATS_CHANNEL are set.');
  process.exit(1);
}

// ===== Keepalive (Railway / basic web server) =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🟢 BusyPang is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // required to access role membership and member events
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, // bans
  ],
});

// ===== State =====
const bannedUsers = new Set();                 // lifetime-ban cache (IDs)
const warningsByGuild = new Map();             // Map<guildId, Map<userId, count>>
const ADMIN_CMDS = new Set(['warn','ban','pardon','banlist','warnlist','clearwarns','addkeyword','removekeyword','listkeywords']);
const isAdmin = (interactionOrMember) => {
  try {
    // if interaction object
    if (interactionOrMember.memberPermissions) {
      return interactionOrMember.memberPermissions.has(PermissionsBitField.Flags.Administrator);
    }
    // if a Member-like object
    if (interactionOrMember.permissions) {
      return interactionOrMember.permissions.has(PermissionsBitField.Flags.Administrator);
    }
    return false;
  } catch { return false; }
};

// ===== Helpers =====
const log = (guild, content) => {
  try {
    const ch = guild.channels.cache.get(LOG_CHANNEL);
    if (ch) ch.send({ content }).catch(() => {});
  } catch (e) { /* ignore */ }
};
const getGuildWarnings = (gid) => {
  let m = warningsByGuild.get(gid);
  if (!m) { m = new Map(); warningsByGuild.set(gid, m); }
  return m;
};

// ===== Region Roles (from env) =====
// Put ROLE_ID_1 ... ROLE_ID_15 in your Railway environment variables
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

// ===== Time formatting helper (Malaysia MYT, 12-hour) =====
function formatMYTTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  }).format(date);
}

// ===== Region leaderboard building and updating =====
function buildRegionEmbed(guild) {
  // map region roles to counts (role may be undefined if env id missing)
  const regionData = Object.entries(REGION_ROLES)
    .filter(([id]) => id) // ignore empty keys
    .map(([id, label]) => {
      const role = guild.roles.cache.get(id);
      return { id, label, count: role ? role.members.size : 0 };
    })
    .sort((a,b) => b.count - a.count);

  const medals = ["🏆","🥈","🥉"];
  const lines = regionData.map((r,i) => `${medals[i] || `#${i+1}`} **${r.label}** — ${r.count} member(s)`);

  return new EmbedBuilder()
    .setTitle("🌐 Malaysia Region Leaderboard")
    .setDescription(lines.join('\n') || '_No region roles found._')
    .setColor(0x2ecc71)
    .setFooter({ text: `Last updated: ${formatMYTTime(new Date())}` })
    .setTimestamp();
}

async function updateRegionStats(guild) {
  try {
    if (FORCE_FETCH_MEMBERS) {
      // careful: fetch all members for accurate counts in very large servers may be heavy
      await guild.members.fetch().catch(() => {});
    }
    const channel = guild.channels.cache.get(STATS_CHANNEL);
    if (!channel) return;
    const embed = buildRegionEmbed(guild);

    // find latest bot message (prefer the message created by this bot with same title)
    const messages = await channel.messages.fetch({ limit: 25 }).catch(() => new Map());
    const botMsg = messages.find(m => m.author && m.author.id === client.user.id
      && (m.embeds?.[0]?.title === '🌐 Malaysia Region Leaderboard'));

    if (botMsg) {
      await botMsg.edit({ embeds: [embed] }).catch(() => {});
    } else {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to updateRegionStats:', err);
  }
}

// ===== Keyword moderation (file-based) =====
const keywordsFile = path.join(__dirname, 'keywords.json');
if (!fs.existsSync(keywordsFile)) fs.writeFileSync(keywordsFile, JSON.stringify([]));
const loadKeywords = () => {
  try { return JSON.parse(fs.readFileSync(keywordsFile, 'utf8') || '[]'); } catch { return []; }
};
const saveKeywords = (arr) => fs.writeFileSync(keywordsFile, JSON.stringify(arr, null, 2));

// delete and mention when blocked word found
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    const keywords = loadKeywords();
    if (!keywords.length) return;
    const content = (message.content || '').toLowerCase();
    const found = keywords.find(k => k && content.includes(k.toLowerCase()));
    if (found) {
      await message.delete().catch(() => {});
      await message.channel.send({ content: `🚫 <@${message.author.id}>, your message contained a blocked keyword (\`${found}\`).` }).catch(() => {});
      log(message.guild, `🛡️ Blocked message by <@${message.author.id}> in #${message.channel.name} — matched keyword: \`${found}\``);
    }
  } catch (e) {
    console.error('messageCreate handler error', e);
  }
});

// ===== Presence randomizer helper =====
function setRandomPresence() {
  const activities = [
    { type: 0, name: 'I am BusyBot | /bb' },   // Playing
    { type: 3, name: "you'all 👀" },           // Watching
    { type: 2, name: '/commands 🎶' },         // Listening
  ];
  const a = activities[Math.floor(Math.random()*activities.length)];
  try {
    client.user.setPresence({ activities: [{ name: a.name, type: a.type }], status: 'online' });
  } catch (e) {
    console.error('setPresence failed', e);
  }
}

// ===== Join / Leave logs & auto-ban on leave =====
function joinEmbed(member) {
  const created = formatMYTTime(member.user.createdAt);
  const joined = formatMYTTime(new Date());
  const regionRole = Object.entries(REGION_ROLES).find(([id]) => id && member.roles.cache.has(id));
  return new EmbedBuilder()
    .setTitle('👋 Member Joined')
    .setColor(0x00b3ff)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User', value: `${member.user.tag} (<@${member.id}>)`, inline: false },
      { name: 'User ID', value: `${member.id}`, inline: true },
      { name: 'Account Created', value: `${created}`, inline: true },
      { name: 'Joined Server', value: `${joined}`, inline: true },
      { name: 'Region Role', value: regionRole ? regionRole[1] : 'None', inline: true },
    )
    .setFooter({ text: `User joined` })
    .setTimestamp();
}

function leaveEmbed(user, guild, reasonText = '') {
  const leftAt = formatMYTTime(new Date());
  return new EmbedBuilder()
    .setTitle('❌ Member Left')
    .setColor(0xff6b6b)
    .setThumbnail(user.displayAvatarURL ? user.displayAvatarURL({ size: 256 }) : '')
    .addFields(
      { name: 'User', value: `${user.tag || user.username} (${user.id ? `<@${user.id}>` : user.id || 'unknown'})`, inline: false },
      { name: 'User ID', value: `${user.id || 'unknown'}`, inline: true },
      { name: 'Left at', value: `${leftAt}`, inline: true },
      { name: 'Note', value: reasonText || 'Left server', inline: false },
    )
    .setTimestamp();
}

client.on('guildMemberAdd', async (member) => {
  try {
    // if user is in lifetime ban cache -> ban immediately
    if (bannedUsers.has(member.id)) {
      try {
        await member.guild.members.ban(member.id, { reason: 'Rejoined after lifetime ban (automatic re-ban)' });
        log(member.guild, `🚫 Auto-rebanned ${member.user.tag} (${member.id}) on join.`);
      } catch (e) {
        log(member.guild, `⚠️ Could not auto-ban ${member.user.tag} on join — check bot role/permissions.`);
      }
      return;
    }

    // log join embed
    const ch = member.guild.channels.cache.get(LOG_CHANNEL);
    if (ch) ch.send({ embeds: [joinEmbed(member)] }).catch(() => {});
    // update region stats (incremental)
    await updateRegionStats(member.guild);
  } catch (e) {
    console.error('guildMemberAdd error', e);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    // log leave embed (member object may be partial if user left; we still have some info)
    const ch = member.guild.channels.cache.get(LOG_CHANNEL);
    const warnMap = getGuildWarnings(member.guild.id);
    const warns = warnMap.get(member.id) || 0;

    if (ch) ch.send({ embeds: [leaveEmbed(member.user || member, member.guild, `Warnings: ${warns}/3`)] }).catch(() => {});

    // if you want to permanently ban everyone who leaves regardless of warns, uncomment below:
    // bannedUsers.add(member.id); await member.guild.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });

    // this behavior: ban when they had 3 warnings already OR you want to ban all leavers
    if (warns >= 3) {
      bannedUsers.add(member.id);
      try {
        await member.guild.members.ban(member.id, { reason: 'Left after 3 warnings (lifetime ban)' });
        log(member.guild, `🚫 Auto-banned ${member.user?.tag || member.id} on leave (3 warnings).`);
      } catch (e) {
        log(member.guild, `⚠️ Could not auto-ban ${member.user?.tag || member.id} on leave.`);
      }
    } else {
      // If you want to ban all leavers unconditionally, use above commented code.
    }

    // update region stats
    await updateRegionStats(member.guild);
  } catch (e) {
    console.error('guildMemberRemove error', e);
  }
});

// update region on role changes, adds/removes
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const regionRoleIds = Object.keys(REGION_ROLES).filter(Boolean);
    const changed = regionRoleIds.some(rid => oldMember.roles.cache.has(rid) !== newMember.roles.cache.has(rid));
    if (changed) await updateRegionStats(newMember.guild);
  } catch (e) { console.error('guildMemberUpdate error', e); }
});

client.on('roleDelete', async (role) => {
  try { await updateRegionStats(role.guild); } catch (e) {}
});
client.on('guildMemberAdd', async (m) => { try { await updateRegionStats(m.guild); } catch {} });
client.on('guildMemberRemove', async (m) => { try { await updateRegionStats(m.guild); } catch {} });

// ===== Slash command interactions =====
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, guild } = interaction;
    if (!guild) return interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });

    // admin guard
    if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
      return interaction.reply({ content: '⛔ You must be an Admin to run this command.', ephemeral: true });
    }

    // keywords: add/remove/list
    if (cmd === 'addkeyword') {
      const word = interaction.options.getString('word').trim().toLowerCase();
      const arr = loadKeywords();
      if (arr.includes(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` already exists.`, ephemeral: true });
      arr.push(word); saveKeywords(arr);
      return interaction.reply({ content: `✅ Added keyword: \`${word}\``, ephemeral: true });
    }
    if (cmd === 'removekeyword') {
      const word = interaction.options.getString('word').trim().toLowerCase();
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

    // /regions
    if (cmd === 'regions') {
      const embed = buildRegionEmbed(guild);
      return interaction.reply({ embeds: [embed] });
    }

    // /bb help
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

    // warnings check
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

      // DM to user
      try {
        const dm = new EmbedBuilder()
          .setTitle('⚠️ You have received a warning')
          .setDescription(`You have received a warning in **${guild.name}**.`)
          .addFields(
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: `${reason}`, inline: false },
            { name: 'Warning Count', value: `${next}/3`, inline: true },
          )
          .setTimestamp();
        if (RULES_LINK) dm.addFields({ name: '📜 Rules', value: `[View rules](${RULES_LINK})`, inline: false });
        await user.send({ embeds: [dm] }).catch(() => {});
      } catch (e) {}

      await interaction.reply({ content: `⚠️ Warned **${user.tag}** — now at **${next}/3**. 📝 ${reason}` });
      log(guild, `⚠️ ${interaction.user.tag} warned ${user.tag} — ${next}/3 — ${reason}`);

      // auto-ban at 3 warnings
      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (by ${interaction.user.tag})` });
          // DM ban
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
          } catch (e) {}
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

    // clearwarns
    if (cmd === 'clearwarns') {
      const user = interaction.options.getUser('member');
      const warnMap = getGuildWarnings(guild.id);
      warnMap.set(user.id, 0);
      await interaction.reply({ content: `🧹 Cleared warnings for **${user.tag}**.` });
      log(guild, `🧹 ${interaction.user.tag} cleared warnings for ${user.tag}.`);
      return;
    }

    // ban
    if (cmd === 'ban') {
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        // DM
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
        } catch (e) {}
        await interaction.reply({ content: `🚫 Banned **${user.tag}**. 📝 ${reason}` });
        log(guild, `🚫 ${interaction.user.tag} banned ${user.tag} — ${reason}`);
      } catch (e) {
        console.error('ban error', e);
        await interaction.reply({ content: '⚠️ Could not ban that user — check my role position & permissions.' });
      }
      return;
    }

    // pardon (unban by ID)
    if (cmd === 'pardon') {
      const userId = interaction.options.getString('user_id');
      const reason = interaction.options.getString('reason') || `Pardon by ${interaction.user.tag}`;
      bannedUsers.delete(userId);
      getGuildWarnings(guild.id).set(userId, 0);
      try {
        await guild.bans.remove(userId, reason);
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

    // banlist
    if (cmd === 'banlist') {
      const bans = await guild.bans.fetch();
      const lines = [];
      for (const [id, b] of bans) lines.push(`• **${b.user.tag}** (<@${id}>)`);
      const embed = new EmbedBuilder().setTitle('📕 Lifetime Ban List').setDescription(lines.join('\n') || '_No bans._').setColor(0xff0000);
      return interaction.reply({ embeds: [embed] });
    }

    // warnlist
    if (cmd === 'warnlist') {
      const warnMap = getGuildWarnings(guild.id);
      const entries = [...warnMap.entries()].filter(([,c]) => c > 0);
      const lines = [];
      for (const [id, count] of entries) {
        let tag = id;
        try { const u = await client.users.fetch(id); tag = u.tag; } catch {}
        lines.push(`• **${tag}** — ${count}/3 (<@${id}>)`);
      }
      const embed = new EmbedBuilder().setTitle('🧾 Warning List').setDescription(lines.join('\n') || '_No warnings._').setColor(0xffc107);
      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('interaction handler error', err);
    if (!interaction.replied) interaction.reply({ content: '❌ Unexpected error. Try again later.', ephemeral: true }).catch(()=>{});
  }
});

// ===== Keep ban cache in sync with guild bans =====
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// ===== Safety listeners =====
client.on('error', console.error);
client.on('shardError', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// ===== Client ready: note - v15+ uses clientReady, add fallback ready for older versions =====
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // sync bans for all guilds at startup
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
    setInterval(() => updateRegionStats(guild), 5 * 60 * 1000);
  }
});
// fallback for older installs that still emit 'ready'
client.once('ready', () => {
  console.warn('⚠️ Using fallback "ready" event; please upgrade to a discord.js version that emits clientReady (future compatibility).');
  // call clientReady handler manually if not already called
  if (client.listenerCount('clientReady') > 0) {
    client.emit('clientReady');
  }
});

// ===== Start (login) =====
client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});