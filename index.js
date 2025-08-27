const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// === DISCORD SETTINGS ===
const TOKEN = "your bot token"; // 🔑 Your bot token
const LOG_CHANNEL_ID = "your log channel id";

// === EXPRESS WEB SERVER FOR PINGER ===
const app = express();
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(3000, () => console.log("✅ Web server running on port 3000"));

// === DISCORD BOT ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let bannedUsers = new Set();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// === MEMBER JOIN ===
client.on('guildMemberAdd', member => {
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);

  if (bannedUsers.has(member.id)) {
    member.ban({ reason: 'Rejoined after leaving (lifetime ban)' })
      .then(() => logChannel?.send(`🚫 **${member.user.tag}** tried to rejoin and was banned.`))
      .catch(err => {
        console.error(err);
        logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or role too low.`);
      });
  } else {
    logChannel?.send(`✅ **${member.user.tag}** joined the server.`);
  }
});

// === MEMBER LEAVE ===
client.on('guildMemberRemove', member => {
  bannedUsers.add(member.id);
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  logChannel?.send(`❌ **${member.user.tag}** left the server and is now banned for life.`);

  member.ban({ reason: 'Left the server (lifetime ban)' })
    .catch(err => {
      console.error(err);
      logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or role too low.`);
    });
});

// === COMMANDS ===
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

  // --- BAN COMMAND ---
  if (command === 'ban') {
    const user = message.mentions.users.first();
    if (!user) return message.reply("⚠️ Please mention a user to ban.");

    const reason = args.slice(1).join(" ") || `Manual ban by ${message.author.tag}`;
    const member = message.guild.members.cache.get(user.id);

    bannedUsers.add(user.id);

    if (member) {
      await member.ban({ reason }).catch(err => {
        console.error(err);
        return message.reply("⚠️ Could not ban the user (check permissions).");
      });
    }

    logChannel?.send(`🚫 **${message.author.tag}** manually banned **${user.tag}**\n📝 Reason: ${reason}`);
    message.reply(`✅ **${user.tag}** has been banned.\n📝 Reason: ${reason}`);
  }

  // --- PARDON COMMAND ---
  if (command === 'pardon') {
    const user = message.mentions.users.first();
    if (!user) return message.reply("⚠️ Please mention a user to pardon.");

    const reason = args.slice(1).join(" ") || `Pardon issued by ${message.author.tag}`;
    bannedUsers.delete(user.id);

    await message.guild.bans.remove(user.id, reason).catch(err => {
      console.error(err);
      return message.reply("⚠️ Could not unban the user (maybe they are not banned?).");
    });

    logChannel?.send(`✅ **${message.author.tag}** pardoned **${user.tag}**\n📝 Reason: ${reason}`);
    message.reply(`✅ **${user.tag}** has been pardoned.\n📝 Reason: ${reason}`);
  }

  // --- BANLIST COMMAND ---
  if (command === 'banlist') {
    if (bannedUsers.size === 0) {
      return message.reply("📋 No users are in the lifetime ban list.");
    }
    const list = [...bannedUsers].map(id => `<@${id}>`).join(", ");
    message.reply(`📋 Lifetime Ban List:\n${list}`);
  }

  // --- HELP COMMAND ---
  if (command === 'help') {
    message.reply(`
📖 **Gatekeeper Bot Commands**
\`!ban @user [reason]\` → Ban a user (added to lifetime ban list).
\`!pardon @user [reason]\` → Unban a user (removed from lifetime ban list).
\`!banlist\` → Show all users in the lifetime ban list.
\`!help\` → Show this help message.
    `);
  }
});

client.login(TOKEN);