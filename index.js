// index.js
// BusyPang / Gatekeeper Bot — Moderation + Region Leaderboard + Keyword Blocker
// Version: v1.7 (finalized for your requested features)

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActivityType,
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===== Environment (Railway) =====
const TOKEN            = process.env.DISCORD_TOKEN;
const CLIENT_ID        = process.env.CLIENT_ID || null;
const GUILD_ID         = process.env.GUILD_ID || null;
const LOG_CHANNEL      = process.env.LOG_CHANNEL;        // existing
const STATS_CHANNEL    = process.env.STATS_CHANNEL;      // existing
const JOIN_LOG_CHANNEL = process.env.JOIN_LOG_CHANNEL || '1245585972163514388'; // you provided
const VERIFIED_ROLE    = process.env.VERIFIED_ROLE || '1389578593541165107';     // you provided
const RULES_LINK       = process.env.RULES_LINK || '';
const FORCE_FETCH_MEMBERS = (process.env.FORCE_FETCH_MEMBERS || 'false').toLowerCase() === 'true';

if (!TOKEN || !LOG_CHANNEL || !STATS_CHANNEL) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN, LOG_CHANNEL and STATS_CHANNEL (and others as needed).');
  process.exit(1);
}

// ===== Persistence files =====
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const REGION_CACHE_FILE = path.join(DATA_DIR, 'region_cache.json');       // persistent region counts
const JOIN_MSG_FILE = path.join(DATA_DIR, 'join_messages.json');         // mapping userId -> messageId
const BANNED_CACHE_FILE = path.join(DATA_DIR, 'banned_cache.json');      // persistent ban cache

if (!fs.existsSync(KEYWORDS_FILE)) fs.writeFileSync(KEYWORDS_FILE, '[]', 'utf8');
if (!fs.existsSync(REGION_CACHE_FILE)) fs.writeFileSync(REGION_CACHE_FILE, '{}', 'utf8');
if (!fs.existsSync(JOIN_MSG_FILE)) fs.writeFileSync(JOIN_MSG_FILE, '{}', 'utf8');
if (!fs.existsSync(BANNED_CACHE_FILE)) fs.writeFileSync(BANNED_CACHE_FILE, '[]', 'utf8');

const readJSON = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8') || 'null') || fallback; } catch { return fallback; }
};
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2), 'utf8');

// ===== Region role IDs (pull from env ROLE_ID_1 ... ROLE_ID_15) =====
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
// filter out any empty keys (if env not set)
for (const k of Object.keys(REGION_ROLES)) {
  if (!k) delete REGION_ROLES[k];
}

// ===== Simple helpers =====
const keywordsFile = KEYWORDS_FILE;
const loadKeywords = () => readJSON(keywordsFile, []);
const saveKeywords = (arr) => writeJSON(keywordsFile, arr);

const bannedUsers = new Set(readJSON(BANNED_CACHE_FILE, []));
const saveBannedCache = () => writeJSON(BANNED_CACHE_FILE, [...bannedUsers]);

const regionCache = readJSON(REGION_CACHE_FILE, {}); // {guildId: {roleId: count, ...}}
const joinMessages = readJSON(JOIN_MSG_FILE, {});    // {guildId: {userId: messageId}}

const saveRegionCache = () => writeJSON(REGION_CACHE_FILE, regionCache);
const saveJoinMessages = () => writeJSON(JOIN_MSG_FILE, joinMessages);

// timezone - MYT 12-hour
function formatMYTTime(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  }).format(d);
}

// ===== Express keepalive for Railway =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🟢 BusyPang is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ===== Discord client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

// warnings and admin set
const warningsByGuild = new Map(); // Map<guildId, Map<userId, count>>
const ADMIN_CMDS = new Set(['warn','ban','pardon','banlist','warnlist','clearwarns','addkeyword','removekeyword','listkeywords']);

const isAdmin = (interactionOrMember) => {
  try {
    if (interactionOrMember.memberPermissions) {
      return interactionOrMember.memberPermissions.has(PermissionsBitField.Flags.Administrator);
    }
    if (interactionOrMember.member && interactionOrMember.member.permissions) {
      return interactionOrMember.member.permissions.has(PermissionsBitField.Flags.Administrator);
    }
  } catch {}
  return false;
};

const getGuildWarnings = (gid) => {
  let m = warningsByGuild.get(gid);
  if (!m) { m = new Map(); warningsByGuild.set(gid, m); }
  return m;
};

const logToChannel = async (guild, content) => {
  try {
    const ch = guild.channels.cache.get(LOG_CHANNEL);
    if (ch) await ch.send({ content }).catch(()=>{});
  } catch {}
};

// ===== Build region embed (pretty) =====
function buildRegionEmbed(guild) {
  // safe: ensure role fetch or cached counts exist
  const rc = regionCache[guild.id] || {};
  // build array of {label, count, roleId} - use live role counts where possible
  const arr = Object.entries(REGION_ROLES).map(([roleId, label]) => {
    const role = guild.roles.cache.get(roleId);
    const liveCount = role ? role.members.size : (rc[roleId] || 0);
    return { roleId, label, count: liveCount };
  }).sort((a,b) => b.count - a.count);

  const medals = ['🏆','🥈','🥉'];
  const lines = arr.map((r,i) => `${medals[i] || `#${i+1}`} **${r.label}** — ${r.count} member(s)`).join('\n');

  return new EmbedBuilder()
    .setTitle('🌐 Malaysia Region Leaderboard')
    .setDescription(lines || '_No region roles found._')
    .setColor(0x2ecc71)
    .setFooter({ text: `Last updated: ${formatMYTTime(new Date())}` })
    .setTimestamp();
}

// update and persist regionCache for a guild (will also edit stats channel message)
async function updateRegionStats(guild) {
  try {
    if (FORCE_FETCH_MEMBERS) {
      await guild.members.fetch().catch(()=>{});
    }

    const counts = {};
    for (const roleId of Object.keys(REGION_ROLES)) {
      const role = guild.roles.cache.get(roleId);
      counts[roleId] = role ? role.members.size : 0;
    }
    regionCache[guild.id] = counts;
    saveRegionCache();

    const statsCh = guild.channels.cache.get(STATS_CHANNEL);
    if (!statsCh) return;
    const embed = buildRegionEmbed(guild);

    // edit existing bot message in stats channel if found, else send new
    const messages = await statsCh.messages.fetch({ limit: 20 }).catch(()=>new Map());
    const existing = messages.find(m => m.author && m.author.id === client.user.id);
    if (existing) {
      await existing.edit({ embeds: [embed] }).catch(()=>statsCh.send({ embeds: [embed] }).catch(()=>{}));
    } else {
      await statsCh.send({ embeds: [embed] }).catch(()=>{});
    }
  } catch (e) {
    console.error('updateRegionStats error', e);
  }
}

// ===== Join/Leave logging + persistent join message editing =====
async function createOrUpdateJoinMessage(member, opts = {}) {
  try {
    const guild = member.guild;
    const ch = guild.channels.cache.get(JOIN_LOG_CHANNEL);
    if (!ch) return;

    const guildMap = joinMessages[guild.id] || {};
    const existingMessageId = guildMap[member.id];

    // build embed content from member state
    const hasVerified = member.roles.cache.has(VERIFIED_ROLE);
    // find region role label if any
    const roleIds = Object.keys(REGION_ROLES);
    const chosenRole = roleIds.find(rid => member.roles.cache.has(rid));
    const regionLabel = chosenRole ? REGION_ROLES[chosenRole] : 'Not selected';

    const embed = new EmbedBuilder()
      .setTitle('👋 Member Joined / Updated')
      .setDescription(`User: ${member.user.tag} (<@${member.id}>)`)
      .addFields(
        { name: 'Region', value: `${regionLabel}`, inline: true },
        { name: 'Verified', value: hasVerified ? '✅' : '❌', inline: true },
      )
      .setFooter({ text: `Member ID: ${member.id} • ${formatMYTTime(new Date())}` })
      .setTimestamp();

    if (existingMessageId) {
      // try edit
      try {
        const msg = await ch.messages.fetch(existingMessageId).catch(()=>null);
        if (msg) {
          await msg.edit({ embeds: [embed] }).catch(async ()=>{
            // if cannot edit, send new and update mapping
            const newMsg = await ch.send({ embeds: [embed] }).catch(()=>null);
            if (newMsg) { guildMap[member.id] = newMsg.id; joinMessages[guild.id] = guildMap; saveJoinMessages(); }
          });
          return;
        }
      } catch {}
    }

    // otherwise send new and persist
    const sent = await ch.send({ embeds: [embed] }).catch(()=>null);
    if (sent) {
      guildMap[member.id] = sent.id;
      joinMessages[guild.id] = guildMap;
      saveJoinMessages();
    }
  } catch (e) {
    console.error('createOrUpdateJoinMessage error', e);
  }
}

// ===== Keyword moderation =====
client.on('messageCreate', async (message) => {
  try {
    if (message.author?.bot) return;
    const keywords = loadKeywords().map(k => k.toLowerCase().trim()).filter(Boolean);
    if (!keywords.length) return;
    const content = (message.content || '').toLowerCase();
    const found = keywords.find(k => content.includes(k));
    if (found) {
      await message.delete().catch(()=>{});
      await message.channel.send({ content: `🚫 <@${message.author.id}>, your message contained a blocked keyword (\`${found}\`).` }).catch(()=>{});
      if (message.guild) await logToChannel(message.guild, `🛡️ Blocked message by <@${message.author.id}> in #${message.channel.name} — matched: \`${found}\``);
    }
  } catch (e) {
    console.error('keyword moderator error', e);
  }
});

// ===== Presence randomizer =====
function setRandomPresence() {
  try {
    const activities = [
      { type: ActivityType.Playing, name: 'I am BusyBot | /bb' },
      { type: ActivityType.Watching, name: "you'all 👀" },
      { type: ActivityType.Listening, name: '/commands 🎶' },
    ];
    const a = activities[Math.floor(Math.random()*activities.length)];
    client.user.setPresence({ activities: [{ name: a.name, type: a.type }], status: 'online' }).catch(()=>{});
  } catch (e) { console.error('setRandomPresence error', e); }
}

// ===== Boot / ready (clientReady) =====
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // sync bans for all guilds into bannedUsers cache
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch().catch(()=>new Map());
      for (const [id] of bans) bannedUsers.add(id);
      saveBannedCache();
      console.log(`🔄 Synced ${bans.size || 0} bans for ${guild.name}`);
    } catch (e) {
      console.warn('Failed to sync bans for', guild?.name, e?.message || e);
    }
  }

  // presence
  setRandomPresence();
  setInterval(setRandomPresence, 10 * 60 * 1000);

  // initial region stats & periodic update
  const guild = client.guilds.cache.first();
  if (guild) {
    await updateRegionStats(guild);
    setInterval(()=>updateRegionStats(guild), 5 * 60 * 1000);
  }
});

// ===== Member join/leave handlers =====
client.on('guildMemberAdd', async (member) => {
  try {
    // If this user is in bannedUsers, try to ban immediately
    if (bannedUsers.has(member.id)) {
      await member.guild.members.ban(member.id, { reason: 'Rejoined while on lifetime ban' }).catch(async (e)=>{
        // couldn't ban — log
        await logToChannel(member.guild, `⚠️ Attempted to auto-ban rejoin of <@${member.id}> but failed. Check bot role/perm.`);
      });
      await logToChannel(member.guild, `🚫 Auto-banned rejoined user <@${member.id}> (previous lifetime ban).`);
      return;
    }

    // create join message
    await createOrUpdateJoinMessage(member);

    // update region stats (incremental)
    await updateRegionStats(member.guild);

    // log join
    await logToChannel(member.guild, `👋 **${member.user.tag}** joined the server.`);
  } catch (e) {
    console.error('guildMemberAdd error', e);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    // add to lifetime ban cache and attempt to ban by ID
    bannedUsers.add(member.id);
    saveBannedCache();

    try {
      await member.guild.members.ban(member.id, { reason: 'Left the server (auto lifetime ban)' });
      await logToChannel(member.guild, `❌ **${member.user.tag}** left and was auto-banned (lifetime).`);
    } catch (e) {
      await logToChannel(member.guild, `⚠️ ${member.user.tag} left but I couldn't ban by role/perm. Member ID: ${member.id}`);
    }

    // update region stats
    await updateRegionStats(member.guild);
  } catch (e) {
    console.error('guildMemberRemove error', e);
  }
});

// update join message when roles change (region selected or verified toggled)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    // update join message display if region/verified changed
    const regionRoleIds = Object.keys(REGION_ROLES);
    const regionChanged = regionRoleIds.some(rid => (oldMember.roles.cache.has(rid) !== newMember.roles.cache.has(rid)));
    const verifiedChanged = (oldMember.roles.cache.has(VERIFIED_ROLE) !== newMember.roles.cache.has(VERIFIED_ROLE));
    if (regionChanged || verifiedChanged) {
      await createOrUpdateJoinMessage(newMember);
      await updateRegionStats(newMember.guild);
      await logToChannel(newMember.guild, `🔄 Role update for ${newMember.user.tag} — region/verified changed.`);
    }
  } catch (e) {
    console.error('guildMemberUpdate error', e);
  }
});

// ===== Interaction (slash command) handler =====
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, guild } = interaction;
    if (!guild) return interaction.reply({ content: 'This command must be used inside a server.', ephemeral: true });

    // admin guard
    if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
      return interaction.reply({ content: '⛔ You must be an Admin to run this command.', ephemeral: true });
    }

    // KEYWORD MANAGEMENT
    if (cmd === 'addkeyword') {
      const w = (interaction.options.getString('word') || '').trim().toLowerCase();
      if (!w) return interaction.reply({ content: 'Provide a word to add.', ephemeral: true });
      const arr = loadKeywords();
      if (arr.includes(w)) return interaction.reply({ content: `⚠️ Keyword \`${w}\` already exists.`, ephemeral: true });
      arr.push(w); saveKeywords(arr);
      return interaction.reply({ content: `✅ Added keyword: \`${w}\``, ephemeral: true });
    }
    if (cmd === 'removekeyword') {
      const w = (interaction.options.getString('word') || '').trim().toLowerCase();
      let arr = loadKeywords();
      if (!arr.includes(w)) return interaction.reply({ content: `⚠️ \`${w}\` not found.`, ephemeral: true });
      arr = arr.filter(x => x !== w); saveKeywords(arr);
      return interaction.reply({ content: `✅ Removed keyword: \`${w}\``, ephemeral: true });
    }
    if (cmd === 'listkeywords') {
      const arr = loadKeywords();
      if (!arr.length) return interaction.reply({ content: '🚫 No blocked keywords.', ephemeral: true });
      return interaction.reply({ content: `🛡️ Blocked keywords:\n\`\`\`${arr.join(', ')}\`\`\``, ephemeral: true });
    }

    // PUBLIC: regions
    if (cmd === 'regions') {
      const embed = buildRegionEmbed(guild);
      return interaction.reply({ embeds: [embed] });
    }

    // HELP
    if (cmd === 'bb') {
      const embed = new EmbedBuilder()
        .setTitle('🤖 BusyPang — Help & Commands')
        .setColor(0x00b3ff)
        .setDescription([
          '### 👥 Everyone',
          '`/warnings [member]` — Check warnings',
          '`/regions` — Show region leaderboard',
          '`/bb` — Show this help',
          '',
          '### 🛡️ Admin only',
          '`/warn @member [reason]` — Add warning (3=auto-ban)',
          '`/clearwarns @member` — Reset warnings',
          '`/ban @member [reason]` — Ban immediately',
          '`/pardon user_id [reason]` — Unban by ID & reset warnings',
          '`/banlist` — Show ban list',
          '`/warnlist` — Show warning list',
          '',
          '### 🪄 Keywords',
          '`/addkeyword word` — Add blocked word',
          '`/removekeyword word` — Remove blocked word',
          '`/listkeywords` — Show all keywords',
        ].join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    // warnings
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warnings.` });
    }

    // warn
    if (cmd === 'warn') {
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);
      const current = warnMap.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnMap.set(user.id, next);

      // DM user politely
      try {
        const dm = new EmbedBuilder()
          .setTitle('⚠️ You have received a warning')
          .setDescription(`You have received a warning in **${guild.name}**.`)
          .addFields(
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: `${reason}`, inline: false },
            { name: 'Warning Count', value: `${next}/3`, inline: true },
          ).setTimestamp();
        if (RULES_LINK) dm.addFields({ name: '📜 Rules', value: `[View rules](${RULES_LINK})`, inline: false });
        await user.send({ embeds: [dm] }).catch(()=>{});
      } catch {}

      await interaction.reply({ content: `⚠️ Warned **${user.tag}** — now at **${next}/3**.` });
      await logToChannel(guild, `⚠️ ${interaction.user.tag} warned ${user.tag} — ${next}/3 — ${reason}`);

      if (next >= 3) {
        bannedUsers.add(user.id); saveBannedCache();
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (by ${interaction.user.tag})` });
          await interaction.followUp({ content: `🚫 **${user.tag}** reached 3 warnings and was banned.` });
          await logToChannel(guild, `🚫 Auto-banned ${user.tag} at 3 warnings.`);
        } catch (e) {
          await interaction.followUp({ content: `⚠️ Could not ban ${user.tag}, check my role/permissions.` });
          await logToChannel(guild, `⚠️ Failed to auto-ban ${user.tag} at 3 warnings — role/perm issue.`);
        }
      }
      return;
    }

    // clearwarns
    if (cmd === 'clearwarns') {
      const user = interaction.options.getUser('member');
      const wm = getGuildWarnings(guild.id);
      wm.set(user.id, 0);
      await interaction.reply({ content: `🧹 Cleared warnings for **${user.tag}**.` });
      await logToChannel(guild, `🧹 ${interaction.user.tag} cleared warnings for ${user.tag}.`);
      return;
    }

    // ban
    if (cmd === 'ban') {
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id); saveBannedCache();
      try {
        await guild.members.ban(user.id, { reason });
        await interaction.reply({ content: `🚫 Banned **${user.tag}**.` });
        await logToChannel(guild, `🚫 ${interaction.user.tag} banned ${user.tag} — ${reason}`);
      } catch (e) {
        await interaction.reply({ content: `⚠️ Could not ban ${user.tag} — check my role & permissions.` });
      }
      return;
    }

    // pardon/unban by ID
    if (cmd === 'pardon') {
      const userId = interaction.options.getString('user_id');
      const reason = interaction.options.getString('reason') || `Pardon by ${interaction.user.tag}`;
      bannedUsers.delete(userId); saveBannedCache();
      // reset warnings if present
      try {
        const wm = getGuildWarnings(guild.id);
        if (wm.has(userId)) wm.set(userId, 0);
      } catch {}
      try {
        await guild.bans.remove(userId, reason);
        // try lookup tag
        let tag = userId;
        try { const u = await client.users.fetch(userId); tag = u.tag || userId; } catch {}
        await interaction.reply({ content: `✅ Pardoned **<@${userId}>** (${tag}).` });
        await logToChannel(guild, `✅ ${interaction.user.tag} pardoned ${userId} (${tag}) — ${reason}`);
      } catch (e) {
        await interaction.reply({ content: `⚠️ Could not unban ID ${userId}.` });
      }
      return;
    }

    // banlist
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

    // warnlist
    if (cmd === 'warnlist') {
      const wm = getGuildWarnings(guild.id);
      const entries = [...wm.entries()].filter(([,c]) => c > 0);
      const lines = [];
      for (const [id, c] of entries) {
        let tag = id;
        try { const u = await client.users.fetch(id); tag = u.tag; } catch {}
        lines.push(`• **${tag}** — ${c}/3 (<@${id}>)`);
      }
      const embed = new EmbedBuilder()
        .setTitle('🧾 Warning List')
        .setDescription(lines.join('\n') || '_No warnings._')
        .setColor(0xffc107);
      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('interactionCreate error', err);
    if (!interaction.replied) interaction.reply({ content: '❌ Unexpected error. Try again later.', ephemeral: true }).catch(()=>{});
  }
});

// keep ban cache up to date
client.on('guildBanAdd', (ban) => { bannedUsers.add(ban.user.id); saveBannedCache(); });
client.on('guildBanRemove', (ban) => { bannedUsers.delete(ban.user.id); saveBannedCache(); });

// safety listeners
client.on('error', console.error);
client.on('shardError', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// login
client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});