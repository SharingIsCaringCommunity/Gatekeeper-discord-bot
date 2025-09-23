const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const express = require('express');

// === DISCORD SETTINGS ===
const TOKEN = process.env.DISCORD_TOKEN;   // set in Railway variables
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL; // set in Railway variables

// === KEEPALIVE WEB SERVER ===
const app = express();
app.get('/', (_req, res) => res.send('Bot is running!'));
app.listen(3000, () => console.log('✅ Web server running on port 3000'));

// === DISCORD CLIENT ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ]
});

// === GATEKEEPER BOT DATA ===
let bannedUsers = new Set();
let warnings = new Map(); // userID → warning count

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.first();
  if (!guild) return;

  try {
    const bans = await guild.bans.fetch();
    bannedUsers.clear();
    for (const [id] of bans) bannedUsers.add(id);
    console.log(`🔄 Synced ${bans.size} banned IDs into lifetime list.`);
  } catch (e) {
    console.error('Failed to fetch bans:', e);
  }
});

// === MEMBER JOINS ===
client.on('guildMemberAdd', async (member) => {
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (bannedUsers.has(member.id)) {
    try {
      await member.guild.members.ban(member.id, { reason: 'Rejoined after leaving (lifetime ban)' });
      logChannel?.send(`🚫 **${member.user.tag}** tried to rejoin and was banned.\n📝 Reason: Rejoined after leaving`);
    } catch (err) {
      logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or bot role too low.`);
    }
  } else {
    logChannel?.send(`✅ **${member.user.tag}** joined the server.`);
  }
});

// === MEMBER LEAVES ===
client.on('guildMemberRemove', async (member) => {
  const guild = member.guild;
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);

  bannedUsers.add(member.id);
  logChannel?.send(`❌ **${member.user.tag}** left.\n🚫 Now banned for life.`);

  try {
    await guild.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch (err) {
    logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or bot role too low.`);
  }
});

// === COMMAND HANDLER ===
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
  const parts = message.content.trim().split(/\s+/);
  const cmd = parts.shift().toLowerCase();
  const extractId = (token) => token?.replace(/[<@!>]/g, '');

// === WARN ===
  if (cmd === '!warn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Only admins can issue warnings.");
    }
    const token = parts[0];
    if (!token) return message.reply("⚠️ Usage: `!warn @user [reason]`");

    const userId = extractId(token);
    const reason = parts.slice(1).join(" ") || `Warned by ${message.author.tag}`;
    let count = warnings.get(userId) || 0;
    count++;
    warnings.set(userId, count);

    const user = await client.users.fetch(userId).catch(() => null);
    const tag = user?.tag || userId;

    if (count >= 3) {
      bannedUsers.add(userId);
      try {
        await message.guild.members.ban(userId, { reason: `Reached 3 warnings: ${reason}` });
        logChannel?.send(`🚫 **${message.author.tag}** banned **${tag}** after 3 warnings.\n📝 Reason: ${reason}`);
        return message.reply(`🚫 **${tag}** has been banned after 3 warnings.`);
      } catch {
        return message.reply("⚠️ Could not ban this user — check the bot's role is above theirs.");
      }
    }

    logChannel?.send(`⚠️ **${message.author.tag}** warned **${tag}** (${count}/3)\n📝 Reason: ${reason}`);
    message.reply(`⚠️ **${tag}** has been warned. (${count}/3)\n📝 Reason: ${reason}`);
  }

// === WARNINGS ===
  if (cmd === '!warnings') {
    let userId = parts[0] ? extractId(parts[0]) : message.author.id;
    const count = warnings.get(userId) || 0;
    const user = await client.users.fetch(userId).catch(() => null);
    const tag = user?.tag || userId;
    message.reply(`📋 **${tag}** has ${count}/3 warnings.`);
  }

// === BAN ===
  if (cmd === '!ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Only admins can manually ban users.");
    }
    const token = parts[0];
    if (!token) return message.reply('⚠️ Usage: `!ban @user [reason]`');

    const userId = extractId(token);
    const reason = parts.slice(1).join(' ') || `Manual ban by ${message.author.tag}`;
    bannedUsers.add(userId);

    try {
      await message.guild.members.ban(userId, { reason });
      const user = await client.users.fetch(userId).catch(() => null);
      const tag = user?.tag || userId;
      message.reply(`🚫 Banned **${tag}**.\n📝 Reason: ${reason}`);
      logChannel?.send(`🚫 **${message.author.tag}** banned **${tag}**\n📝 Reason: ${reason}`);
    } catch {
      message.reply("⚠️ Could not ban this user — check the bot's role is above theirs.");
    }
  }

// === PARDON ===
  if (cmd === '!pardon') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Only admins can pardon users.");
    }
    const token = parts[0];
    if (!token) return message.reply('⚠️ Usage: `!pardon @user [reason]`');

    const userId = extractId(token);
    const reason = parts.slice(1).join(' ') || `Pardon issued by ${message.author.tag}`;
    bannedUsers.delete(userId);
    warnings.delete(userId);

    try {
      await message.guild.bans.remove(userId, reason);
      const user = await client.users.fetch(userId).catch(() => null);
      const tag = user?.tag || userId;
      message.reply(`✅ Pardoned **${tag}**.\n📝 Reason: ${reason}`);
      logChannel?.send(`✅ **${message.author.tag}** pardoned **${tag}**\n📝 Reason: ${reason}`);
    } catch {
      message.reply("⚠️ Could not unban this user — maybe they're not banned?");
    }
  }

// --- CLEAR WARNS ---
if (cmd === '!clearwarns') {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply("❌ Only admins can clear warnings.");
  }
  const token = parts[0];
  if (!token) return message.reply('⚠️ Usage: `!clearwarns @user [reason]`');

  const userId = extractId(token);
  const reason = parts.slice(1).join(' ') || `Warnings cleared by ${message.author.tag}`;
  warnings.delete(userId);

  const user = await client.users.fetch(userId).catch(() => null);
  const tag = user?.tag || userId;

  message.reply(`✅ Cleared all warnings for **${tag}**.\n📝 Reason: ${reason}`);
  logChannel?.send(`✅ **${message.author.tag}** cleared all warnings for **${tag}**\n📝 Reason: ${reason}`);
}

// === BANLIST ===
  if (cmd === '!banlist' || cmd === '!bannedlist') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Only admins can view the ban list.");
    }
    if (bannedUsers.size === 0) return message.reply("📋 No users are in the lifetime ban list.");
    const ids = [...bannedUsers];
    const lines = [];
    for (const id of ids) {
      try {
        const user = await client.users.fetch(id);
        lines.push(`**${user.tag}** (${id})`);
      } catch {
        lines.push(`(unknown user) (${id})`);
      }
    }
    message.reply(`📋 **Banned Members:**\n${lines.join('\n')}`);
  }

// --- HELP / GK BOT ---
if (cmd === '!gkbot') {
  message.reply(
    "📖 **Gatekeeper Bot Commands**\n" +
    "```\n" +
    "!warn @user [reason]        → Warn a user (3 warnings = ban, Admin only)\n" +
    "!warnings [@user]           → Check warnings (anyone)\n" +
    "!clearwarns @user [reason]  → Reset a user’s warnings (Admin only)\n" +
    "!ban @user [reason]         → Manual ban (Admin only)\n" +
    "!pardon @user [reason]      → Unban + reset warnings (Admin only)\n" +
    "!banlist / !bannedlist      → Show all banned members (Admin only)\n" +
    "!gkbot                      → Show this help\n" +
    "```"
  );
}
});

client.login(TOKEN);