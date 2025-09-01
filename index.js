const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const express = require('express');

// === DISCORD SETTINGS ===
const TOKEN = "";  // YOUR TOKEN
const LOG_CHANNEL_ID = ""; // server-logs channel

// === KEEPALIVE WEB SERVER (for pingers) ===
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
    GatewayIntentBits.GuildModeration // (bans)
  ]
});

// Lifetime ban list (synced with guild bans on startup)
let bannedUsers = new Set();

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  // sync with the first (or only) guild the bot is in
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.log('❗ Bot is not in any guild.');
    return;
  }
  try {
    const bans = await guild.bans.fetch();
    bannedUsers.clear();
    for (const [id] of bans) bannedUsers.add(id);
    console.log(`🔄 Synced ${bans.size} banned IDs into lifetime list.`);
  } catch (e) {
    console.error('Failed to fetch bans:', e);
  }
});

// MEMBER JOINS
client.on('guildMemberAdd', async (member) => {
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (bannedUsers.has(member.id)) {
    try {
      await member.guild.members.ban(member.id, { reason: 'Rejoined after leaving (lifetime ban)' });
      logChannel?.send(`🚫 **${member.user.tag}** tried to rejoin and was banned.\n📝 Reason: Rejoined after leaving (lifetime ban)`);
    } catch (err) {
      console.error(err);
      logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or role too low.`);
    }
  } else {
    logChannel?.send(`✅ **${member.user.tag}** joined the server.`);
  }
});

// MEMBER LEAVES → add to lifetime list + ban by ID
client.on('guildMemberRemove', async (member) => {
  const guild = member.guild;
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);

  bannedUsers.add(member.id);
  logChannel?.send(`❌ **${member.user.tag}** left the server.\n🚫 Now banned for life.\n📝 Reason: Left the server.`);

  try {
    await guild.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch (err) {
    console.error(err);
    logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or role too low.`);
  }
});

// ===== COMMANDS =====
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith('!')) return;
  if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return; // staff only

  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
  const parts = message.content.trim().split(/\s+/);
  const cmd = parts.shift().toLowerCase();

  // helper: get raw ID from mention or keep raw
  const extractId = (token) => token?.replace(/[<@!>]/g, '');

  // !ban @user|<id> [reason]
  if (cmd === '!ban') {
    const token = parts[0];
    if (!token) return message.reply('⚠️ Usage: `!ban @user [reason]` or `!ban <user_id> [reason]`');

    const userId = extractId(token);
    const reason = parts.slice(1).join(' ') || `Manual ban by ${message.author.tag}`;

    bannedUsers.add(userId);

    try {
      await message.guild.members.ban(userId, { reason });
      // get a nice tag if possible
      let tag = userId;
      try {
        const user = await client.users.fetch(userId);
        tag = user.tag || user.username || userId;
      } catch {}
      message.reply(`🚫 Banned **${tag}**.\n📝 Reason: ${reason}`);
      logChannel?.send(`🚫 **${message.author.tag}** manually banned **<@${userId}>** (${userId})\n📝 Reason: ${reason}`);
    } catch (err) {
      console.error(err);
      message.reply('⚠️ Could not ban that user (permissions/role?).');
    }
  }

  // !pardon @user|<id> [reason]
  if (cmd === '!pardon') {
    const token = parts[0];
    if (!token) return message.reply('⚠️ Usage: `!pardon @user [reason]` or `!pardon <user_id> [reason]`');

    const userId = extractId(token);
    const reason = parts.slice(1).join(' ') || `Pardon issued by ${message.author.tag}`;
    bannedUsers.delete(userId);

    try {
      await message.guild.bans.remove(userId, reason);
      message.reply(`✅ Pardoned <@${userId}>.\n📝 Reason: ${reason}`);
      logChannel?.send(`✅ **${message.author.tag}** pardoned **<@${userId}>** (${userId})\n📝 Reason: ${reason}`);
    } catch (err) {
      console.error(err);
      message.reply('⚠️ Could not unban that user (maybe not banned?).');
    }
  }

  // !banlist (shows resolved usernames even if they’re not in guild)
  if (cmd === '!banlist') {
    if (bannedUsers.size === 0) return message.reply('📋 No users are in the lifetime ban list.');

    const ids = [...bannedUsers];
    const lines = [];
    for (const id of ids) {
      try {
        const user = await client.users.fetch(id);
        const tag = user.tag || user.username || id;
        lines.push(`**${tag}** (${id})`);
      } catch {
        lines.push(`(unknown user) (${id})`);
      }
    }

    const header = '📋 **Lifetime Ban List**\n';
    const chunks = [];
    let buf = header;

    for (const line of lines) {
      if ((buf + line + '\n').length > 1900) {
        chunks.push(buf);
        buf = '';
      }
      buf += line + '\n';
    }
    if (buf.length) chunks.push(buf);

    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  }

  // !help
  if (cmd === '!help') {
    message.reply(
      "📖 **Gatekeeper Bot Commands**\n" +
      "```\n" +
      "!ban @user|<id> [reason]    → Ban & add to lifetime ban list\n" +
      "!pardon @user|<id> [reason] → Unban & remove from lifetime ban list\n" +
      "!banlist                    → Show lifetime ban list\n" +
      "!help                       → Show this help\n" +
      "```"
    );
  }
});

client.login(TOKEN);