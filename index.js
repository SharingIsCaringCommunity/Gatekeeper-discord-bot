// index.js
// BusyPang / Gatekeeper — Full runtime
// Requirements: Node >=18, discord.js v14.x, express
// Env vars required:
//   DISCORD_TOKEN, CLIENT_ID (optional for logging), LOG_CHANNEL, STATS_CHANNEL
// Optional:
//   RULES_LINK, FORCE_FETCH_MEMBERS ('true'|'false'), VERIFIED_ROLE_ID,
//   ROLE_ID_1 ... ROLE_ID_15

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===== Environment =====
const TOKEN         = process.env.DISCORD_TOKEN;
const LOG_CHANNEL   = process.env.LOG_CHANNEL;   // where join/leave/etc logs go (same channel)
const STATS_CHANNEL = process.env.STATS_CHANNEL; // region leaderboard channel
const RULES_LINK    = process.env.RULES_LINK || '';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || null;
const FORCE_FETCH_MEMBERS = (process.env.FORCE_FETCH_MEMBERS || 'false').toLowerCase() === 'true';

if (!TOKEN || !LOG_CHANNEL || !STATS_CHANNEL) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN, LOG_CHANNEL, STATS_CHANNEL.');
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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
});

// ===== In-memory State =====
const bannedUsers = new Set();                 // lifetime ban cache
const warningsByGuild = new Map();             // Map<guildId, Map<userId, count>>
const joinMessageByGuild = new Map();          // Map<guildId, Map<userId, messageId>>
const ADMIN_CMDS = new Set(['warn','ban','pardon','banlist','warnlist','clearwarns','addkeyword','removekeyword','listkeywords']);

const keywordsFile = path.join(__dirname, 'keywords.json');
if (!fs.existsSync(keywordsFile)) fs.writeFileSync(keywordsFile, JSON.stringify([]));
const loadKeywords = () => {
  try { return JSON.parse(fs.readFileSync(keywordsFile, 'utf8') || '[]'); } catch { return []; }
};
const saveKeywords = (arr) => fs.writeFileSync(keywordsFile, JSON.stringify(arr, null, 2));

const isAdmin = (interactionOrMember) => {
  try {
    if (interactionOrMember.memberPermissions) return interactionOrMember.memberPermissions.has(PermissionsBitField.Flags.Administrator);
    if (interactionOrMember.member && interactionOrMember.member.permissions) return interactionOrMember.member.permissions.has(PermissionsBitField.Flags.Administrator);
  } catch {}
  return false;
};

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

// ===== REGION ROLES (read from env ROLE_ID_1...ROLE_ID_15) =====
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

// ===== Helpers =====
function formatMYTTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  }).format(date);
}

function buildRegionEmbed(guild) {
  const regionData = Object.entries(REGION_ROLES)
    .filter(([id]) => id) // skip undefined envs
    .map(([id, label]) => {
      const role = guild.roles.cache.get(id);
      return { label, count: role ? role.members.size : 0 };
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
      await guild.members.fetch().catch(()=>{});
    }
    const channel = guild.channels.cache.get(STATS_CHANNEL);
    if (!channel) return;
    const embed = buildRegionEmbed(guild);
    const messages = await channel.messages.fetch({ limit: 10 }).catch(()=>[]);
    const botMsg = messages.find(m => m.author && m.author.id === client.user.id);
    if (botMsg) {
      await botMsg.edit({ embeds: [embed] }).catch(()=>{});
    } else {
      await channel.send({ embeds: [embed] }).catch(()=>{});
    }
  } catch (e) {
    console.error('updateRegionStats error', e);
  }
}

// ===== Join/Update/Leave Embeds handling =====
function ensureJoinMap(guildId) {
  let m = joinMessageByGuild.get(guildId);
  if (!m) { m = new Map(); joinMessageByGuild.set(guildId, m); }
  return m;
}

function buildMemberCardEmbed(member, state = 'Joined') {
  // member: GuildMember
  const user = member.user;
  const created = formatMYTTime(user.createdAt);
  const joined = member.joinedAt ? formatMYTTime(member.joinedAt) : '—';
  // find region role label
  const regionRoleId = Object.keys(REGION_ROLES).find(rid => rid && member.roles.cache.has(rid));
  const regionLabel = regionRoleId ? REGION_ROLES[regionRoleId] : 'None';
  const verified = VERIFIED_ROLE_ID && member.roles.cache.has(VERIFIED_ROLE_ID) ? '✅' : '❌';

  const emb = new EmbedBuilder()
    .setTitle(`${state} • ${user.username}`)
    .setColor(state === 'Left' ? 0xff4d4f : 0x00b3ff)
    .setThumbnail(user.displayAvatarURL({ size: 1024 }))
    .addFields(
      { name: 'User', value: `${user.tag}`, inline: true },
      { name: 'User ID', value: `${user.id}`, inline: true },
      { name: 'Account Created', value: `${created}`, inline: false },
      { name: 'Joined Server', value: `${joined}`, inline: true },
      { name: 'Region Role', value: `${regionLabel}`, inline: true },
      { name: 'Verified', value: `${verified}`, inline: true },
    )
    .setFooter({ text: `${state} • ${formatMYTTime(new Date())}` })
    .setTimestamp();
  return emb;
}

// ===== Keyword Moderation (file-based) =====
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const keywords = loadKeywords();
    if (!keywords.length) return;
    const content = (message.content || '').toLowerCase();
    const found = keywords.find(k => k && content.includes(k.toLowerCase()));
    if (found) {
      await message.delete().catch(()=>{});
      await message.channel.send({ content: `🚫 <@${message.author.id}>, your message contained a blocked keyword (\`${found}\`).` }).catch(()=>{});
      if (message.guild) log(message.guild, `🛡️ Blocked message by <@${message.author.id}> in #${message.channel.name} — matched keyword: \`${found}\``);
    }
  } catch (e) {
    console.error('messageCreate error', e);
  }
});

// ===== Presence randomizer (fixed) =====
function setRandomPresence() {
  const activities = [
    { type: 0, name: 'I am BusyBot | /bb' }, // Playing
    { type: 3, name: "you'all 👀" },         // Watching
    { type: 2, name: '/commands 🎶' },       // Listening
  ];
  const a = activities[Math.floor(Math.random() * activities.length)];
  try {
    client.user.setPresence({ activities: [{ name: a.name, type: a.type }], status: 'online' });
  } catch (e) {
    console.error('setPresence failed', e);
  }
}

// ===== Boot / Sync on startup =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // sync bans for all guilds on startup
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch().catch(()=>new Map());
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
  for (const [, guild] of client.guilds.cache) {
    try {
      await updateRegionStats(guild);
    } catch {}
  }
  setInterval(() => {
    for (const [, guild] of client.guilds.cache) updateRegionStats(guild);
  }, 5 * 60 * 1000);
});

// keep ban cache in sync
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// ===== Member join / leave / update handling =====
client.on('guildMemberAdd', async (member) => {
  try {
    // if user is in lifetime ban cache -> ban immediately
    if (bannedUsers.has(member.id)) {
      try {
        await member.guild.members.ban(member.id, { reason: 'Rejoined after lifetime ban' });
        log(member.guild, `🚫 **${member.user.tag}** tried to rejoin and was re-banned.`);
      } catch (e) {
        log(member.guild, `⚠️ Could not ban ${member.user.tag} on rejoin — check role/permissions.`);
      }
      return;
    }

    // send join embed and store message id for later edit
    const embed = buildMemberCardEmbed(member, 'Joined');
    const ch = member.guild.channels.cache.get(LOG_CHANNEL);
    if (!ch) return;
    const msg = await ch.send({ embeds: [embed] }).catch(()=>null);
    if (msg) {
      const map = ensureJoinMap(member.guild.id);
      map.set(member.id, msg.id);
    }
    log(member.guild, `👋 ${member.user.tag} joined.`);
    // region stats update
    updateRegionStats(member.guild).catch(()=>{});
  } catch (e) {
    console.error('guildMemberAdd error', e);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    // edit the previous join message if present
    const map = ensureJoinMap(newMember.guild.id);
    const msgId = map.get(newMember.id);
    if (msgId) {
      const ch = newMember.guild.channels.cache.get(LOG_CHANNEL);
      if (ch) {
        try {
          const msg = await ch.messages.fetch(msgId).catch(()=>null);
          if (msg) {
            const editedEmbed = buildMemberCardEmbed(newMember, 'Joined & Updated');
            await msg.edit({ embeds: [editedEmbed] }).catch(()=>{});
          }
        } catch {}
      }
    }
    // If region roles changed, update leaderboard
    const regionRoleIds = Object.keys(REGION_ROLES).filter(Boolean);
    const changed = regionRoleIds.some(rid => oldMember.roles.cache.has(rid) !== newMember.roles.cache.has(rid));
    if (changed) await updateRegionStats(newMember.guild);
  } catch (e) {
    console.error('guildMemberUpdate error', e);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    // add to lifetime ban cache and attempt ban-by-id
    bannedUsers.add(member.id);
    try {
      await member.guild.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
    } catch (e) {
      // ban by id may still succeed; log if failed
      log(member.guild, `⚠️ Could not auto-ban ${member.user.tag} after leaving — check role/permissions.`);
    }

    // send leave embed (new message)
    const embed = buildMemberCardEmbed(member, 'Left');
    const ch = member.guild.channels.cache.get(LOG_CHANNEL);
    if (ch) await ch.send({ embeds: [embed] }).catch(()=>{});

    // remove stored join message id
    const map = ensureJoinMap(member.guild.id);
    map.delete(member.id);

    log(member.guild, `❌ ${member.user.tag} left and was added to lifetime ban list.`);
    updateRegionStats(member.guild).catch(()=>{});
  } catch (e) {
    console.error('guildMemberRemove error', e);
  }
});

// ===== Slash command handler =====
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, guild } = interaction;
    if (!guild) return interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });

    // keyword admin commands
    if (cmd === 'addkeyword') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const word = interaction.options.getString('word').toLowerCase();
      const arr = loadKeywords();
      if (arr.includes(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` already exists.`, ephemeral: true });
      arr.push(word); saveKeywords(arr);
      return interaction.reply({ content: `✅ Added keyword: \`${word}\``, ephemeral: true });
    }
    if (cmd === 'removekeyword') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const word = interaction.options.getString('word').toLowerCase();
      let arr = loadKeywords();
      if (!arr.includes(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` not found.`, ephemeral: true });
      arr = arr.filter(x => x !== word); saveKeywords(arr);
      return interaction.reply({ content: `✅ Removed keyword: \`${word}\``, ephemeral: true });
    }
    if (cmd === 'listkeywords') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const arr = loadKeywords();
      if (!arr.length) return interaction.reply({ content: `🚫 No blocked keywords.`, ephemeral: true });
      return interaction.reply({ content: `🛡️ Blocked keywords:\n\`\`\`${arr.join(', ')}\`\`\``, ephemeral: true });
    }

    // public: regions
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
          '`/pardon user_id` — Unban by ID',
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

    // warnings (anyone can check)
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warnings.` });
    }

    // warn (admin)
    if (cmd === 'warn') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
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
        await user.send({ embeds: [dm] }).catch(()=>{});
      } catch {}

      await interaction.reply({ content: `⚠️ Warned **${user.tag}** — now at **${next}/3**. 📝 ${reason}` });
      log(guild, `⚠️ ${interaction.user.tag} warned ${user.tag} — ${next}/3 — ${reason}`);

      // auto-ban at 3
      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (by ${interaction.user.tag})` });
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
          await user.send({ embeds: [banDM] }).catch(()=>{});
          log(guild, `🚫 Auto-banned ${user.tag} at 3 warnings (by ${interaction.user.tag}).`);
          await interaction.followUp({ content: `🚫 **${user.tag}** reached 3/3 warnings and was banned for life.` });
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
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const user = interaction.options.getUser('member');
      getGuildWarnings(guild.id).set(user.id, 0);
      await interaction.reply({ content: `🧹 Cleared warnings for **${user.tag}**.` });
      log(guild, `🧹 ${interaction.user.tag} cleared warnings for ${user.tag}.`);
      return;
    }

    // ban (admin)
    if (cmd === 'ban') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
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
        await user.send({ embeds: [banDM] }).catch(()=>{});
        await interaction.reply({ content: `🚫 Banned **${user.tag}**. 📝 ${reason}` });
        log(guild, `🚫 ${interaction.user.tag} banned ${user.tag} — ${reason}`);
      } catch (e) {
        console.error('ban error', e);
        await interaction.reply({ content: '⚠️ Could not ban that user — check my role position & permissions.' });
      }
      return;
    }

    // pardon (admin) — unban by user ID
    if (cmd === 'pardon') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
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

    // banlist (admin)
    if (cmd === 'banlist') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const bans = await guild.bans.fetch().catch(()=>new Map());
      const lines = [];
      for (const [id, b] of bans) lines.push(`• **${b.user.tag}** (<@${id}>)`);
      const text = lines.join('\n') || '_No bans._';
      // trim to allowed length
      return interaction.reply({ content: `📕 Lifetime Ban List\n\n${text.slice(0,1900)}` });
    }

    // warnlist (admin)
    if (cmd === 'warnlist') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const warnMap = getGuildWarnings(guild.id);
      const entries = [...warnMap.entries()].filter(([,c])=>c>0);
      const lines = [];
      for (const [id,count] of entries) {
        let tag = id;
        try { const u = await client.users.fetch(id); tag = u.tag; } catch {}
        lines.push(`• **${tag}** — ${count}/3 (<@${id}>)`);
      }
      const text = lines.join('\n') || '_No warnings._';
      return interaction.reply({ content: `🧾 Warning List\n\n${text.slice(0,1900)}` });
    }

  } catch (err) {
    console.error('interaction handler error', err);
    if (!interaction.replied) interaction.reply({ content: '❌ Unexpected error. Try again later.', ephemeral: true }).catch(()=>{});
  }
});

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