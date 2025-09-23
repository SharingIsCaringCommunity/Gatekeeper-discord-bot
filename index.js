// index.js — BusyPang Bot v1.5.3
// Env: DISCORD_TOKEN, LOG_CHANNEL

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL;

// Keepalive
const app = express();
app.get("/", (_req, res) => res.send("BusyPang Bot is running."));
app.listen(3000, () => console.log("✅ Web server running on port 3000"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
  ],
});

let bannedUsers = new Set();
let warnings = new Map();

const isAdmin = (m) => m.permissions.has(PermissionsBitField.Flags.Administrator);
const warnCountString = (n) => `${n}/3`;
const log = (guild, msg) => guild?.channels.cache.get(LOG_CHANNEL_ID)?.send(msg);

// Sync bans
async function syncBansForGuild(guild) {
  try {
    const bans = await guild.bans.fetch();
    bannedUsers.clear();
    for (const [id] of bans) bannedUsers.add(id);
    console.log(`🔄 Synced ${bans.size} banned IDs for ${guild.name}`);
  } catch (e) {
    console.error("Failed to fetch bans:", e?.message || e);
  }
}

client.on("guildBanAdd", (ban) => bannedUsers.add(ban.user.id));
client.on("guildBanRemove", (ban) => bannedUsers.delete(ban.user.id));

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.first();
  if (guild) await syncBansForGuild(guild);
});

// Auto ban on rejoin/leave
client.on("guildMemberAdd", async (member) => {
  if (bannedUsers.has(member.id)) {
    try {
      await member.guild.members.ban(member.id, { reason: "Rejoined after leaving (lifetime ban)" });
      log(member.guild, `🚫 **${member.user.tag}** tried to rejoin and was banned.`);
    } catch {
      log(member.guild, `⚠️ Could not ban **${member.user.tag}** — role too low.`);
    }
  }
});

client.on("guildMemberRemove", async (member) => {
  bannedUsers.add(member.id);
  log(member.guild, `❌ **${member.user.tag}** left.\n🚫 Now banned for life.`);
  try {
    await member.guild.members.ban(member.id, { reason: "Left the server (lifetime ban)" });
  } catch {
    log(member.guild, `⚠️ Could not ban **${member.user.tag}** — role too low.`);
  }
});

// Slash command handling
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  const { commandName } = interaction;
  const guild = interaction.guild;
  const fail = (msg) => interaction.reply({ content: msg, ephemeral: true });

  // /warn
  if (commandName === "warn") {
    if (!isAdmin(interaction.member)) return fail("❌ Only admins can issue warnings.");
    const user = interaction.options.getUser("member", true);
    const reason = interaction.options.getString("reason") || `Warned by ${interaction.user.tag}`;

    let count = warnings.get(user.id) || 0;
    count++;
    warnings.set(user.id, count);

    if (count >= 3) {
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason: `Reached 3 warnings: ${reason}` });
        await interaction.reply(`🚫 **${user.tag}** banned after 3 warnings.\n📝 Reason: ${reason}`);
        log(guild, `🚫 **${interaction.user.tag}** banned **${user.tag}** after 3 warnings.\n📝 ${reason}`);
      } catch {
        await fail("⚠️ Could not ban this user — bot role too low.");
      }
      return;
    }

    await interaction.reply(`⚠️ **${user.tag}** warned. (${warnCountString(count)})\n📝 Reason: ${reason}`);
    log(guild, `⚠️ **${interaction.user.tag}** warned **${user.tag}** (${warnCountString(count)})\n📝 ${reason}`);
    return;
  }

  // /warnings
  if (commandName === "warnings") {
    const user = interaction.options.getUser("member") || interaction.user;
    const count = warnings.get(user.id) || 0;
    await interaction.reply(`📋 **${user.tag}** has ${warnCountString(count)} warnings.`);
    return;
  }

  // /clearwarns
  if (commandName === "clearwarns") {
    if (!isAdmin(interaction.member)) return fail("❌ Only admins can clear warnings.");
    const user = interaction.options.getUser("member", true);
    const reason = interaction.options.getString("reason") || `Warnings cleared by ${interaction.user.tag}`;
    warnings.delete(user.id);
    await interaction.reply(`✅ Cleared all warnings for **${user.tag}**.\n📝 Reason: ${reason}`);
    log(guild, `✅ **${interaction.user.tag}** cleared warnings for **${user.tag}**\n📝 ${reason}`);
    return;
  }

  // /ban
  if (commandName === "ban") {
    if (!isAdmin(interaction.member)) return fail("❌ Only admins can ban.");
    const user = interaction.options.getUser("member", true);
    const reason = interaction.options.getString("reason") || `Manual ban by ${interaction.user.tag}`;
    bannedUsers.add(user.id);
    try {
      await guild.members.ban(user.id, { reason });
      await interaction.reply(`🚫 Banned **${user.tag}**.\n📝 Reason: ${reason}`);
      log(guild, `🚫 **${interaction.user.tag}** banned **${user.tag}**\n📝 ${reason}`);
    } catch {
      await fail("⚠️ Could not ban this user — bot role too low.");
    }
    return;
  }

  // /pardon
  if (commandName === "pardon") {
    if (!isAdmin(interaction.member)) return fail("❌ Only admins can pardon.");
    const user = interaction.options.getUser("member", true);
    const reason = interaction.options.getString("reason") || `Pardon issued by ${interaction.user.tag}`;
    bannedUsers.delete(user.id);
    warnings.delete(user.id);
    try {
      await guild.bans.remove(user.id, reason);
      await interaction.reply(`✅ Pardoned **${user.tag}**.\n📝 Reason: ${reason}`);
      log(guild, `✅ **${interaction.user.tag}** pardoned **${user.tag}**\n📝 ${reason}`);
    } catch {
      await fail("⚠️ Could not unban this user — maybe not banned?");
    }
    return;
  }

  // /banlist
  if (commandName === "banlist") {
    if (!isAdmin(interaction.member)) return fail("❌ Only admins can view the ban list.");
    if (bannedUsers.size === 0) return interaction.reply("📋 No users in the lifetime ban list.");

    const ids = [...bannedUsers];
    const lines = [];
    for (const id of ids) {
      try {
        const u = await client.users.fetch(id);
        lines.push(`**${u.tag}** (${id})`);
      } catch {
        lines.push(`(unknown user) (${id})`);
      }
    }

    await interaction.reply("📋 **Banned Members:**\n" + lines.join("\n"));
    return;
  }

  // /bb (help)
  if (commandName === "bb") {
    const help = new EmbedBuilder()
      .setTitle("🤖 BusyPang Bot — Commands")
      .setDescription(
        [
          "`/warn @member [reason]` – Warn a member (3 warnings = auto-ban) **Admin only**",
          "`/warnings [@member]` – Check warnings (anyone)",
          "`/clearwarns @member [reason]` – Reset warnings **Admin only**",
          "`/ban @member [reason]` – Manual ban **Admin only**",
          "`/pardon @member [reason]` – Unban & reset warnings **Admin only**",
          "`/banlist` – Show lifetime-banned users **Admin only**",
          "`/bb` – Show this help",
        ].join("\n")
      )
      .setColor(0xffcc00);
    await interaction.reply({ embeds: [help], ephemeral: true });
  }
});

client.login(TOKEN);