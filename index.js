const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');
const fs = require('fs');

// ===== Environment =====
const TOKEN = process.env.DISCORD_TOKEN;
const LOG_CHANNEL = process.env.LOG_CHANNEL;
const RULES_LINK = process.env.RULES_LINK || "";
if (!TOKEN || !LOG_CHANNEL) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN and LOG_CHANNEL.');
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
  ],
});

// =============================================
// Keyword Filtering
// =============================================
let keywords = [];
try {
  const data = fs.readFileSync('./keywords.json', 'utf8');
  keywords = JSON.parse(data);
  console.log(`🧠 Loaded ${keywords.length} blocked keywords.`);
} catch (err) {
  console.log('⚠️ No keywords.json found — creating a new one.');
  fs.writeFileSync('./keywords.json', '[]');
  keywords = [];
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.toLowerCase();
  const foundKeyword = keywords.find((kw) => content.includes(kw.toLowerCase()));
  if (foundKeyword) {
    await message.delete().catch(() => {});
    await message.channel.send({
      content: `🚫 <@${message.author.id}>, your message contained a **blocked keyword**. Please follow the server rules.`,
    });
  }
});

// =============================================
// Region Leaderboard
// =============================================
const REGION_ROLES = {
  "ROLE_ID_1": ":house_with_garden: NEGERI SEMBILAN",
  "ROLE_ID_2": ":hot_pepper: KELANTAN",
  "ROLE_ID_3": ":park: PERAK",
  "ROLE_ID_4": ":elephant: PAHANG",
  "ROLE_ID_5": ":cityscape: SELANGOR",
  "ROLE_ID_6": ":ear_of_rice: KEDAH",
  "ROLE_ID_7": ":turtle: TERENGGANU",
  "ROLE_ID_8": ":lion_face: JOHOR",
  "ROLE_ID_9": ":grapes: PERLIS",
  "ROLE_ID_10": ":palm_tree: PENANG",
  "ROLE_ID_11": ":anchor: MALACCA",
  "ROLE_ID_12": ":orangutan: SARAWAK",
  "ROLE_ID_13": ":mountain_snow: SABAH",
  "ROLE_ID_14": ":mosque: FEDERAL TERRITORY (KL/PUTRAJAYA/LABUAN)",
  "ROLE_ID_15": ":globe_with_meridians: OTHERS"
};

function malaysiaTime() {
  return new Date().toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour12: true
  });
}

function buildRegionEmbed(guild) {
  let regionData = Object.entries(REGION_ROLES).map(([id, label]) => {
    const role = guild.roles.cache.get(id);
    return { label, count: role ? role.members.size : 0 };
  });

  regionData.sort((a, b) => b.count - a.count);
  const medals = ["🏆", "🥈", "🥉"];
  const roleList = regionData.map((r, i) => {
    const medal = medals[i] || `#${i + 1}`;
    return `**${medal} ${r.label}** — ${r.count} member(s)`;
  }).join("\n");

  return new EmbedBuilder()
    .setTitle("🌐 Malaysia Region Leaderboard")
    .setDescription(roleList || "No region roles found.")
    .setColor("Green")
    .setFooter({ text: `🕒 Last updated: ${malaysiaTime()} MYT` })
    .setTimestamp();
}

async function updateRegionStats(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const embed = buildRegionEmbed(guild);
  const messages = await channel.messages.fetch({ limit: 10 });
  const botMsg = messages.find(m => m.author.id === guild.client.user.id);
  if (botMsg) {
    await botMsg.edit({ embeds: [embed] });
  } else {
    await channel.send({ embeds: [embed] });
  }
}

// =============================================
// Moderation System
// =============================================
const bannedUsers = new Set();
const warningsByGuild = new Map();
const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'warnlist', 'clearwarns']);
const isAdmin = (i) => i.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

const log = (guild, content) => {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch) ch.send({ content }).catch(() => {});
};
const getGuildWarnings = (gid) => {
  let m = warningsByGuild.get(gid);
  if (!m) { m = new Map(); warningsByGuild.set(gid, m); }
  return m;
};

// =============================================
// Activity Randomizer
// =============================================
const activities = [
  { type: 0, name: 'I am BusyBot | /bb' },
  { type: 3, name: "you'all 👀" },
  { type: 2, name: '/commands 🎶' },
];

function setRandomPresence() {
  try {
    const a = activities[Math.floor(Math.random() * activities.length)];
    client.user.setPresence({
      activities: [{ name: a.name, type: a.type }],
      status: 'online',
    });
  } catch (e) {
    console.error('Failed presence:', e);
  }
}

// =============================================
// Ready Event
// =============================================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  setRandomPresence();
  setInterval(setRandomPresence, 10 * 60 * 1000);

  // Auto leaderboard refresh
  const guild = client.guilds.cache.first();
  const channelId = "STATS_CHANNEL_ID"; // your leaderboard channel
  if (guild) {
    await updateRegionStats(guild, channelId);
    setInterval(() => updateRegionStats(guild, channelId), 5 * 60 * 1000);
  }
});

// =============================================
// Slash Command Handler
// =============================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { guild, commandName: cmd } = interaction;
  if (!guild) return;

  // Everyone: /regions
  if (cmd === 'regions') {
    const embed = buildRegionEmbed(guild);
    return interaction.reply({ embeds: [embed] });
  }

  // Admin restriction
  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({ content: '⛔ Admin only.' });
  }

  try {
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
            '`/clearwarns @user` — Reset warnings',
            '`/ban @user [reason]` — Ban immediately',
            '`/pardon user_id:<ID>` — Unban by ID',
            '`/banlist` — Show ban list',
            '`/warnlist` — Show warning list',
          ].join('\n')
        );
      return interaction.reply({ embeds: [emb] });
    }

    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warnings.` });
    }

    if (cmd === 'warn') {
      const user = interaction.options.getUser('member');
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

    if (cmd === 'clearwarns') {
      const user = interaction.options.getUser('member');
      getGuildWarnings(guild.id).set(user.id, 0);
      return interaction.reply(`🧹 Cleared warnings for ${user.tag}.`);
    }

    if (cmd === 'ban') {
      const user = interaction.options.getUser('member');
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

    if (cmd === 'banlist') {
      const bans = await guild.bans.fetch();
      const lines = [];
      for (const [id, ban] of bans) {
        lines.push(`• **${ban.user.tag}** (<@${id}>)`);
      }
      const emb = new EmbedBuilder()
        .setTitle('📕 Ban List')
        .setDescription(lines.join('\n') || '_No bans._')
        .setColor(0xff0000);
      return interaction.reply({ embeds: [emb] });
    }

    if (cmd === 'warnlist') {
      const warnMap = getGuildWarnings(guild.id);
      const lines = [];
      for (const [id, count] of warnMap.entries()) {
        if (count > 0) {
          const u = await client.users.fetch(id).catch(() => null);
          lines.push(`• ${u ? u.tag : id} — ${count}/3`);
        }
      }
      const emb = new EmbedBuilder()
        .setTitle('🧾 Warn List')
        .setDescription(lines.join('\n') || '_No warnings._')
        .setColor(0xffc107);
      return interaction.reply({ embeds: [emb] });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) interaction.reply({ content: '❌ Error occurred.' });
  }
});

// =============================================
// Ban Handlers
// =============================================
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

client.login(TOKEN);