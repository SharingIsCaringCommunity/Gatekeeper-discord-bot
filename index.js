const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const express = require('express');

// === DISCORD SETTINGS ===
const TOKEN = "your-bot-token-here"; // replace with your bot token
const LOG_CHANNEL_ID = "your-log-channel-id-here"; // replace with your log channel ID

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

// Member joins
client.on('guildMemberAdd', member => {
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);

  if (bannedUsers.has(member.id)) {
    member.ban({ reason: 'Rejoined after leaving (lifetime ban)' })
      .then(() => logChannel?.send(`🚫 **${member.user.tag}** tried to rejoin and was banned.\n📝 Reason: Rejoined after leaving (lifetime ban)`))
      .catch(err => {
        console.error(err);
        logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or role too low.`);
      });
  } else {
    logChannel?.send(`✅ **${member.user.tag}** joined the server.`);
  }
});

// Member leaves
client.on('guildMemberRemove', member => {
  bannedUsers.add(member.id);
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  logChannel?.send(`❌ **${member.user.tag}** left the server.\n🚫 Now banned for life.\n📝 Reason: Left the server.`);

  member.ban({ reason: 'Left the server (lifetime ban)' })
    .catch(err => {
      console.error(err);
      logChannel?.send(`⚠️ Could not ban **${member.user.tag}** — Missing permissions or role too low.`);
    });
});

// === COMMANDS ===
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return; // only staff

  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
  const parts = message.content.trim().split(/\s+/);
  const cmd = parts.shift()?.toLowerCase();

  // !ban
  if (cmd === "!ban") {
    const userId = parts[0]?.replace(/[<@!>]/g, "");
    const reason = parts.slice(1).join(" ") || "Manual ban by staff";
    if (!userId) return message.reply("⚠️ Usage: `!ban @user reason`");

    try {
      await message.guild.members.ban(userId, { reason });
      bannedUsers.add(userId);
      message.reply(`🚫 Banned <@${userId}>.\n📝 Reason: ${reason}`);
      logChannel?.send(`🚫 **${message.author.tag}** manually banned <@${userId}>.\n📝 Reason: ${reason}`);
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Could not ban that user (permissions/role?).");
    }
  }

  // !pardon
  if (cmd === "!pardon") {
    const userId = parts[0]?.replace(/[<@!>]/g, "");
    const reason = parts.slice(1).join(" ") || "Pardoned by staff";
    if (!userId) return message.reply("⚠️ Usage: `!pardon @user reason`");

    bannedUsers.delete(userId);
    try {
      await message.guild.members.unban(userId);
      message.reply(`✅ Pardoned <@${userId}>.\n📝 Reason: ${reason}`);
      logChannel?.send(`✅ **${message.author.tag}** pardoned <@${userId}>.\n📝 Reason: ${reason}`);
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Could not unban that user (maybe not banned?).");
    }
  }

  // !banlist
  if (cmd === "!banlist") {
    if (bannedUsers.size === 0) return message.reply("✅ No one is in the lifetime ban list.");
    const list = Array.from(bannedUsers).map(id => `<@${id}> (${id})`).join("\n");
    message.reply(`🚫 Lifetime Ban List:\n${list}`);
  }

  // !help
  if (cmd === "!help") {
    message.reply(
      "**🤖 Gatekeeper Bot Commands**\n" +
      "```\n" +
      "!ban @user [reason]   → Ban user & add to lifetime ban list\n" +
      "!pardon @user [reason]→ Remove from list & unban\n" +
      "!banlist              → Show all IDs in lifetime ban list\n" +
      "!help                 → Show this help menu\n" +
      "```"
    );
  }
});

client.login(TOKEN);