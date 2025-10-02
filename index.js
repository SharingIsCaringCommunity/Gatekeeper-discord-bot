// BusyPang / Gatekeeper — full runtime
// Public replies (not ephemeral), emojis everywhere, per-guild warnings & bans,
// paginated /banlist & /warnlist with Prev/Next/Refresh/Close,
// DM embeds to warned and auto-banned users (includes moderator + optional rules link).

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ActivityType,
} = require('discord.js');
const express = require('express');

// ===== Environment (Railway variables) =====
const TOKEN       = process.env.DISCORD_TOKEN;
const LOG_CHANNEL = process.env.LOG_CHANNEL;          // channel ID for logs
const RULES_LINK  = process.env.RULES_LINK || "";     // optional: https://yourserver/rules

if (!TOKEN || !LOG_CHANNEL) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN and LOG_CHANNEL.');
  process.exit(1);
}

// ===== Keepalive for Railway =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🟢 BusyPang is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,     // enable "Server Members Intent" in Dev Portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,  // bans
    GatewayIntentBits.MessageContent,
  ],
});

// ===== State (in-memory) =====
// Global cache of banned IDs (helps fast re-ban on rejoin). We still live-fetch for /banlist.
const bannedUsers = new Set();
// Per-guild warnings: Map<guildId, Map<userId, count>>
const warningsByGuild = new Map();

const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'warnlist', 'clearwarns']);
const isAdmin = (i) => i.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

// ---- helpers ----
const log = (guild, content) => {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch) ch.send({ content }).catch(() => {});
};
const getGuildWarnings = (gid) => {
  let m = warningsByGuild.get(gid);
  if (!m) { m = new Map(); warningsByGuild.set(gid, m); }
  return m;
};

// ===== Region Leaderboard =====
// replace ROLE_ID_X with actual Discord role IDs
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

async function updateRegionStats(guild, channelId) {
  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    // collect region role counts
    let regionData = Object.entries(REGION_ROLES).map(([id, label]) => {
      const role = guild.roles.cache.get(id);
      return { label, count: role ? role.members.size : 0 };
    });

    // sort by count
    regionData.sort((a, b) => b.count - a.count);

    // medals for top 3
    const medals = ["🏆", "🥈", "🥉"];
    let roleList = regionData.map((r, i) => {
      const medal = medals[i] || `#${i + 1}`;
      return `**${medal} ${r.label}** — ${r.count} member(s)`;
    }).join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🌐 Malaysia Region Leaderboard")
      .setDescription(roleList || "No region roles found.")
      .setColor("Green")
      .setFooter({ text: `Last updated: ${new Date().toLocaleString()}` })
      .setTimestamp();

    // edit existing bot msg if exists
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === guild.client.user.id);

    if (botMsg) {
      await botMsg.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Failed to update region stats:", err);
  }
}

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
    .setFooter({ text: `📄 Page ${page + 1}/${totalPages} • total ${lines.length}` });
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

// Helpful error guards so the bot doesn't crash on transient issues
client.on('error', (err) => console.error('Client error:', err));
client.on('shardError', (err) => console.error('Shard error:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));


client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // — Sync bans at boot (keep your existing code here) —

  // --- Activity randomizer (3 rotating activities) ---
  const activities = [
    { type: 0, name: 'I am BusyBot | /bb' },
    { type: 3, name: "you'all 👀" },
    { type: 2, name: ' /commands 🎶' },
  ];

  function setRandomPresence() {
    try {
      const a = activities[Math.floor(Math.random() * activities.length)];
      client.user.setPresence({
        activities: [{ name: a.name, type: a.type }],
        status: 'online',
      });
    } catch (e) {
      console.error('Failed to set presence:', e);
    }
  }

  setRandomPresence();
  setInterval(setRandomPresence, 10 * 60 * 1000);

  // --- Region leaderboard auto-updater ---
  const guild = client.guilds.cache.first();
  const channelId = "STATS_CHANNEL_ID"; // replace with the ID of the stats channel

  await updateRegionStats(guild, channelId); // run once at startup
  setInterval(() => updateRegionStats(guild, channelId), 5 * 60 * 1000); // refresh every 5min
});

// Keep cache in sync with ban/unban
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// Auto-ban if a banned user rejoins
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
    log(g, `👋 **${member.user.tag}** joined the server.`);
  }
});

// When a member leaves → perma-ban (lifetime)
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
  if (!guild) return;

  // Show commands to everyone, but restrict execution of admin ones
  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({ content: '⛔ You must be an **Admin** to use this command.' });
  }

  try {
    // --- /bb : Help ---
    if (cmd === 'bb') {
      const emb = new EmbedBuilder()
        .setTitle('🤖 BusyPang — Help & Commands')
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
            '`/pardon user_id:<ID> [reason]` — Unban by **User ID** (resets warnings to 0 & allows rejoining)',
            '`/banlist` — Show lifetime ban list (paged)',
            '`/warnlist` — Show warning list (paged)',
          ].join('\n')
        );
      return interaction.reply({ embeds: [emb] });
    }

    // --- /warnings : anyone can check ---
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warning(s).` });
    }

    // --- /warn : admin (mention + DM embed with rules link) ---
    if (cmd === 'warn') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);

      const current = warnMap.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnMap.set(user.id, next);

      // Public reply (mention)
      await interaction.reply(`⚠️ Warned **${user}** — now at **${next}/3**. 📝 ${reason}`);
      log(guild, `⚠️ **${interaction.user.tag}** warned **<@${user.id}>** — ${next}/3. 📝 ${reason}`);

      // DM the warned user (embed box)
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle("⚠️ You Have Received a Warning")
          .setDescription(`You have received a warning in **${guild.name}**.`)
          .addFields(
            { name: "Reason", value: reason || "No reason provided.", inline: false },
            { name: "Warning Count", value: `${next}/3`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          )
          .setFooter({ text: "Please follow the server rules to avoid further action." })
          .setTimestamp();

        if (RULES_LINK) {
          dmEmbed.addFields({ name: "📜 Server Rules", value: `[Click here to read the rules](${RULES_LINK})`, inline: false });
        }

        await user.send({ embeds: [dmEmbed] });
      } catch {/* DMs closed */}

      // Auto-ban at 3
      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (by ${interaction.user.tag})` });

          // DM about the ban
          try {
            const banEmbed = new EmbedBuilder()
              .setColor(0xE53935)
              .setTitle("🚫 You Have Been Banned")
              .setDescription(`You have been **banned** from **${guild.name}**.`)
              .addFields(
                { name: "Reason", value: `3 warnings (auto-ban). Last reason: ${reason}`, inline: false },
                { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
                { name: "Type", value: "Lifetime ban", inline: true },
              )
              .setTimestamp();
            if (RULES_LINK) {
              banEmbed.addFields({ name: "📜 Server Rules", value: `[Review the rules here](${RULES_LINK})`, inline: false });
            }
            await user.send({ embeds: [banEmbed] }).catch(() => {});
          } catch {/* ignore DM error */}

          log(guild, `🚫 Auto-banned **<@${user.id}>** at 3 warnings. (by ${interaction.user.tag})`);
          await interaction.followUp(`🚫 **${user}** has reached **3/3** warnings and was **banned for life**.`);
        } catch {
          log(guild, `⚠️ Could not auto-ban **<@${user.id}>** — check role/permissions.`);
          await interaction.followUp('⚠️ Reached 3 warnings, but I could not ban the user — check my role/permissions.');
        }
      }
      return;
    }

    // --- /clearwarns : admin ---
    if (cmd === 'clearwarns') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warnings cleared by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);
      warnMap.set(user.id, 0);

      await interaction.reply(`🧹 Cleared warnings for **${user}**. 📝 ${reason}`);
      log(guild, `🧹 **${interaction.user.tag}** cleared warnings for **<@${user.id}>**. 📝 ${reason}`);
      return;
    }

    // --- /ban : admin ---
    if (cmd === 'ban') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });

        // DM ban notice
        try {
          const banEmbed = new EmbedBuilder()
            .setColor(0xE53935)
            .setTitle("🚫 You Have Been Banned")
            .setDescription(`You have been **banned** from **${guild.name}**.`)
            .addFields(
              { name: "Reason", value: reason, inline: false },
              { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
              { name: "Type", value: "Lifetime ban", inline: true },
            )
            .setTimestamp();
          if (RULES_LINK) {
            banEmbed.addFields({ name: "📜 Server Rules", value: `[Review the rules here](${RULES_LINK})`, inline: false });
          }
          await user.send({ embeds: [banEmbed] }).catch(() => {});
        } catch {/* ignore DM error */}

        await interaction.reply(`🚫 Banned **${user}**. 📝 ${reason}`);
        log(guild, `🚫 **${interaction.user.tag}** banned **<@${user.id}>**. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not ban that user — check the bot’s role is above theirs.' });
      }
      return;
    }

// --- /pardon : admin (by user_id, works even if not in guild) ---
if (cmd === 'pardon') {
  const userId = interaction.options.getString('user_id'); // STRING option
  const reason = interaction.options.getString('reason') || `Pardon issued by ${interaction.user.tag}`;

  // remove from lifetime cache + reset warnings
  bannedUsers.delete(userId);
  getGuildWarnings(guild.id).set(userId, 0);

  try {
    // unban by ID
    await guild.bans.remove(userId, reason);

    // best-effort fetch for nicer tag in messages
    let tag = userId;
    try {
      const u = await client.users.fetch(userId);
      tag = u?.tag ?? userId;
    } catch {}

    await interaction.reply(`✅ Pardoned **<@${userId}>** (${tag}). 📝 ${reason}`);
    log(guild, `✅ **${interaction.user.tag}** pardoned **<@${userId}>** (${userId}). 📝 ${reason}`);
  } catch (e) {
    await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
  }
  return;
}

    // --- /banlist : admin (paged, live fetch) ---
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

    // --- /warnlist : admin (paged) ---
    if (cmd === 'warnlist') {
      const supplier = async () => {
        const warnMap = getGuildWarnings(guild.id); // Map<userId, count>
        const entries = [...warnMap.entries()].filter(([, c]) => c > 0);
        const rows = [];
        for (const [id, count] of entries) {
          try {
            const u = await client.users.fetch(id);
            const tag = u?.tag ?? 'unknown';
            rows.push(`• **${tag}** — ${count}/3 (<@${id}>)`);
          } catch {
            rows.push(`• (unknown) — ${count}/3 (<@${id}>)`);
          }
        }
        // sort by warnings desc then name
        return rows.sort((a, b) => {
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