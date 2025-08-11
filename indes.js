require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const TOKEN = process.env.TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Store leavers for lifetime ban
let leavers = new Set();

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// Log joins
client.on('guildMemberAdd', member => {
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (leavers.has(member.id)) {
        member.ban({ reason: "Rejoined after leaving — lifetime ban" }).catch(console.error);
        if (logChannel) logChannel.send(`⛔ **${member.user.tag}** was banned for rejoining after leaving.`);
    } else {
        if (logChannel) logChannel.send(`✅ **${member.user.tag}** joined the server.`);
    }
});

// Log leaves and mark them
client.on('guildMemberRemove', member => {
    leavers.add(member.id);
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) logChannel.send(`⚠️ **${member.user.tag}** left the server — marked for lifetime ban.`);
});

// Simple anti-spam
const spamTracker = {};
const SPAM_LIMIT = 5; // messages
const SPAM_WINDOW = 3000; // ms

client.on('messageCreate', message => {
    if (message.author.bot) return;

    const now = Date.now();
    if (!spamTracker[message.author.id]) {
        spamTracker[message.author.id] = [];
    }
    spamTracker[message.author.id].push(now);

    // Keep only recent messages
    spamTracker[message.author.id] = spamTracker[message.author.id].filter(timestamp => now - timestamp < SPAM_WINDOW);

    if (spamTracker[message.author.id].length >= SPAM_LIMIT) {
        message.guild.members.ban(message.author.id, { reason: "Spam detected" }).catch(console.error);
        const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) logChannel.send(`🚫 **${message.author.tag}** was banned for spamming.`);
    }
});

client.login(TOKEN);