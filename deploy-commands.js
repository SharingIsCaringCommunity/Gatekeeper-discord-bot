// deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;   // Application (bot) ID
const GUILD_ID  = process.env.GUILD_ID;    // Your server ID

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Missing env vars. Set DISCORD_TOKEN, CLIENT_ID, GUILD_ID in Railway.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang help & commands'),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check your own or another member’s warnings')
    .addUserOption(o => o.setName('member').setDescription('Member to check')),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (Admins only, 3 warnings = auto-ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear a member’s warnings (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('Member to clear').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a member (Admins only) and clear warnings')
    .addUserOption(o => o.setName('member').setDescription('Member to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show lifetime ban list (Admins only)'),

  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show all members with warnings (Admins only)')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('⏳ Refreshing guild slash commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Successfully registered application (/) commands.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
    process.exit(1);
  }
})();