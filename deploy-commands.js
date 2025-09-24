// One-time/gated deploy of guild slash commands.
// Run manually:  npm run deploy
// Requires: DISCORD_TOKEN, APP_ID, GUILD_ID env vars.

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN   = process.env.DISCORD_TOKEN;
const APP_ID  = process.env.APP_ID;   // Application (bot) ID
const GUILD_ID= process.env.GUILD_ID; // Target guild

if (!TOKEN || !APP_ID || !GUILD_ID) {
  console.error('❌ Set DISCORD_TOKEN, APP_ID, and GUILD_ID env vars.');
  process.exit(1);
}

const commands = [
  // /bb
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang help & commands'),

  // /warnings [member]
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check your warnings (or another member\'s warnings)')
    .addUserOption(o => o.setName('member').setDescription('Member to check')),

  // /warn @member [reason]  (Admin)
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (3 warnings = auto-ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /clearwarns @member [reason]  (Admin)
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset a member\'s warnings to 0')
    .addUserOption(o => o.setName('member').setDescription('Member to reset').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /ban @member [reason]  (Admin)
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /pardon @member [reason]  (Admin)
  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user and reset warnings to 0')
    .addUserOption(o => o.setName('member').setDescription('User to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /banlist  (Admin)
  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show all permanently banned users (paged)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // /warnlist  (Admin)
  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show members with warnings (paged)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('🧹 Clearing GUILD commands …');
    await rest.put(
      Routes.applicationGuildCommands(APP_ID, GUILD_ID),
      { body: [] }
    );

    console.log('🚀 Registering guild slash commands …');
    await rest.put(
      Routes.applicationGuildCommands(APP_ID, GUILD_ID),
      { body: commands }
    );

    console.log('✅ Successfully registered application (/) commands.');
  } catch (err) {
    console.error('❌ Deploy failed:', err?.message || err);
    process.exit(1);
  }
})();