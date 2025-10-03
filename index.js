// BusyPang — Moderation + Malaysia Region Leaderboard
// Auto role counts with incremental updates + Malaysia time in footer

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

// ===== Environment =====
const TOKEN         = process.env.DISCORD_TOKEN;
const LOG_CHANNEL   = process.env.LOG_CHANNEL;
const STATS_CHANNEL = process.env.STATS_CHANNEL;
const RULES_LINK    = process.env.RULES_LINK || "";

if (!TOKEN || !LOG_CHANNEL) {
  console.error("❌ Missing env vars. Set DISCORD_TOKEN and LOG_CHANNEL.");
  process.exit(1);
}

// ===== Keepalive (Railway) =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🟢 BusyPang is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ===== Client =====
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
const bannedUsers = new Set();
const warningsByGuild = new Map();
const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'warnlist', 'clearwarns']);
const isAdmin = (i) => i.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

// ===== Region config =====
const REGION_LIST = [
  { id: process.env.ROLE_ID_1, label: '🏠 NEGERI SEMBILAN' },
  { id: process.env.ROLE_ID_2, label: '🌶️ KELANTAN' },
  { id: process.env.ROLE_ID_3, label: '🌳 PERAK' },
  { id: process.env.ROLE_ID_4, label: '🐘 PAHANG' },
  { id: process.env.ROLE_ID_5, label: '🏙️ SELANGOR' },
  { id: process.env.ROLE_ID_6, label: '🌾 KEDAH' },
  { id: process.env.ROLE_ID_7, label: '🐢 TERENGGANU' },
  { id: process.env.ROLE_ID_8, label: '🦁 JOHOR' },
  { id: process.env.ROLE_ID_9, label: '🍇 PERLIS' },
  { id: process.env.ROLE_ID_10, label: '🌴 PENANG' },
  { id: process.env.ROLE_ID_11, label: '⚓ MALACCA' },
  { id: process.env.ROLE_ID_12, label: '🦧 SARAWAK' },
  { id: process.env.ROLE_ID_13, label: '⛰️ SABAH' },
  { id: process.env.ROLE_ID_14, label: '🕌 FEDERAL TERRITORY (KL/PUTRAJAYA/LABUAN)' },
  { id: process.env.ROLE_ID_15, label: '🌐 OTHERS' },
].filter(r => r.id);

// ===== Region counts cache =====
const regionCounts = new Map(); // roleId -> count

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

function malaysiaTimeStrings() {
  const now = new Date();
  const malaysiaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  const full = malaysiaNow.toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const friendlyTime = malaysiaNow.toLocaleTimeString('en-US', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: true });
  return { full, friendlyTime };
}

// ===== Build Leaderboard Embed =====
function buildRegionEmbed() {
  const regionData = REGION_LIST.map(entry => {
    const count = regionCounts.get(entry.id) || 0;
    return { label: entry.label, count };
  });

  regionData.sort((a, b) => b.count - a.count);

  const medals = ["🏆", "🥈", "🥉"];
  const lines = regionData.map((r, i) => {
    const medal = medals[i] || `#${i + 1}`;
    return `**${medal} ${r.label}** — ${r.count} member(s)`;
  });

  const { full, friendlyTime } = malaysiaTimeStrings();

return new EmbedBuilder()
  .setTitle("🌐 Malaysia Region Leaderboard")
  .setDescription(lines.join("\n") || "No region roles found.")
  .setColor("Green")
  .setFooter({ text: `Last updated (Malaysia Time): ${full} | ${friendlyTime}` });
}

// ===== Update stats in STATS_CHANNEL =====
async function updateRegionStats(guild, channelId) {
  if (!channelId) return;
  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const embed = buildRegionEmbed();
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);

    let botMsg;
    if (messages) {
      botMsg = messages.find(m =>
        m.author?.id === client.user?.id &&
        m.embeds[0]?.title?.includes("Malaysia Region Leaderboard")
      );
    }

    if (botMsg) {
      await botMsg.edit({ embeds: [embed] }).catch(() => {});
    } else {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error("❌ Failed to update region stats:", err);
  }
}

// ===== Incremental Updates =====
client.on("guildMemberAdd", (member) => {
  if (member.user.bot) return;
  for (const { id } of REGION_LIST) {
    if (member.roles.cache.has(id)) {
      regionCounts.set(id, (regionCounts.get(id) || 0) + 1);
    }
  }
});

client.on("guildMemberRemove", (member) => {
  if (member.user.bot) return;
  for (const { id } of REGION_LIST) {
    if (member.roles.cache.has(id)) {
      regionCounts.set(id, Math.max(0, (regionCounts.get(id) || 0) - 1));
    }
  }
});

client.on("guildMemberUpdate", (oldM, newM) => {
  if (newM.user.bot) return;
  for (const { id } of REGION_LIST) {
    const hadRole = oldM.roles.cache.has(id);
    const hasRole = newM.roles.cache.has(id);
    if (!hadRole && hasRole) {
      regionCounts.set(id, (regionCounts.get(id) || 0) + 1);
    } else if (hadRole && !hasRole) {
      regionCounts.set(id, Math.max(0, (regionCounts.get(id) || 0) - 1));
    }
  }
});

// ===== Ready =====
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Init counts once
  const guild = client.guilds.cache.first();
  if (guild) {
    await guild.members.fetch().catch(() => {});
    for (const { id } of REGION_LIST) {
      const role = guild.roles.cache.get(id);
      if (role) {
        const count = role.members.filter(m => !m.user.bot).size;
        regionCounts.set(id, count);
      }
    }

    // initial update + auto refresh
    await updateRegionStats(guild, STATS_CHANNEL);
    setInterval(() => updateRegionStats(guild, STATS_CHANNEL), 5 * 60 * 1000);
  }
});

// ===== Commands =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { guild, commandName: cmd } = interaction;
  if (!guild) return;

  // Public command
  if (cmd === "regions") {
    const embed = buildRegionEmbed(); // now from cache
    return interaction.reply({ embeds: [embed] });
  }  

  // Admin restriction
  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({ content: '⛔ Admin only.' });
  }

  try {
    // /bb
    if (cmd === 'bb') {
      const emb = new EmbedBuilder()
        .setTitle('🤖 BusyPang — Help & Commands')
        .setColor(0x00b3ff)
        .setDescription(
          [
            '### 👥 Everyone',
            '`/warnings [@user]` — Check warnings',
            '`/regions` — Show region leaderboard',
            '`/bb` — Show this help',
            '',
            '### 🛡️ Admin only',
            '`/warn @user [reason]` — Add warning (3 = auto-ban)',
            '`/clearwarns @user [reason]` — Reset warnings',
            '`/ban @user [reason]` — Ban immediately',
            '`/pardon user_id:<ID>` — Unban by ID',
            '`/banlist` — Show ban list',
            '`/warnlist` — Show warning list',
          ].join('\n')
        );
      return interaction.reply({ embeds: [emb] });
    }

    // /warnings
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warnings.` });
    }

    // /warn
    if (cmd === 'warn') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);

      const current = warnMap.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnMap.set(user.id, next);

      await interaction.reply(`⚠️ Warned **${user}** — now at **${next}/3**. 📝 ${reason}`);
      log(guild, `⚠️ ${interaction.user.tag} warned ${user.tag} — ${next}/3`);

      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings` });
          await interaction.followUp(`🚫 ${user.tag} reached 3 warnings and was banned.`);
        } catch {
          await interaction.followUp(`⚠️ Could not ban ${user.tag}.`);
        }
      }
      return;
    }

    // /clearwarns
    if (cmd === 'clearwarns') {
      const user   = interaction.options.getUser('member');
      getGuildWarnings(guild.id).set(user.id, 0);
      await interaction.reply(`🧹 Cleared warnings for ${user.tag}.`);
      return;
    }

    // /ban
    if (cmd === 'ban') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        await interaction.reply(`🚫 Banned ${user.tag}. 📝 ${reason}`);
      } catch {
        await interaction.reply(`⚠️ Could not ban ${user.tag}.`);
      }
      return;
    }

    // /pardon
    if (cmd === 'pardon') {
      const userId = interaction.options.getString('user_id');
      bannedUsers.delete(userId);
      getGuildWarnings(guild.id).set(userId, 0);
      try {
        await guild.bans.remove(userId);
        await interaction.reply(`✅ Pardoned <@${userId}>`);
      } catch {
        await interaction.reply(`⚠️ Could not unban ID ${userId}`);
      }
      return;
    }

    // /banlist
    if (cmd === 'banlist') {
      const bans = await guild.bans.fetch();
      const lines = [];
      for (const [id, ban] of bans) {
        lines.push(`• **${ban.user.tag}** (<@${id}>)`);
      }
      return interaction.reply({ embeds: [pageEmbed({ title: '📕 Ban List', lines, page: 0, perPage: 15 })] });
    }

    // /warnlist
    if (cmd === 'warnlist') {
      const warnMap = getGuildWarnings(guild.id);
      const lines = [];
      for (const [id, count] of warnMap.entries()) {
        if (count > 0) {
          const u = await client.users.fetch(id).catch(() => null);
          lines.push(`• ${u ? u.tag : id} — ${count}/3`);
        }
      }
      return interaction.reply({ embeds: [pageEmbed({ title: '🧾 Warn List', lines, page: 0, perPage: 15 })] });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) interaction.reply({ content: '❌ Error occurred.' });
  }
});

// ===== Ban Handlers =====
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

client.login(TOKEN);
