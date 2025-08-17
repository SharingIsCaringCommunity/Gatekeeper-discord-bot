const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// === DISCORD SETTINGS ===
const TOKEN = 
const LOG_CHANNEL_ID = 

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

// FOR MEMBER JOIN
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

// FOR MEMBER LEAVE 
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


client.login(TOKEN);