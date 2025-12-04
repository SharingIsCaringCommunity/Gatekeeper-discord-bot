// deploy-commands.js
// Register guild slash commands (no dotenv needed on Railway)
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN   = process.env.DISCORD_TOKEN;
const CLIENT  = process.env.CLIENT_ID;   // Application (bot) ID
const GUILD   = process.env.GUILD_ID;    // Target guild ID for commands

if (!TOKEN || !CLIENT || !GUILD) {
  console.error('Missing env: DISCORD_TOKEN, CLIENT_ID, GUILD_ID are required.');
  process.exit(1);
}

const adminDefaultPerm = PermissionFlagsBits.Administrator;

const commands = [
  new SlashCommandBuilder().setName('bb').setDescription('BusyPang help & commands').toJSON(),

  new SlashCommandBuilder()
    .setName('warnings').setDescription('Check warnings (yours or another member)')
    .addUserOption(o => o.setName('member').setDescription('Member to check').setRequired(false)).toJSON(),

  new SlashCommandBuilder()
    .setName('warn').setDescription('Warn a member (3 warnings = lifetime ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('clearwarns').setDescription('Reset a member’s warnings to 0')
    .addUserOption(o => o.setName('member').setDescription('Member to reset').setRequired(true))
    .setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('ban').setDescription('Ban a member immediately (lifetime)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('pardon').setDescription('Unban a user by ID + resets warnings to 0')
    .addStringOption(o => o.setName('user_id').setDescription('User ID to unban (paste numeric ID)').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('banlist').setDescription('Show lifetime ban list (admin)').setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('warnlist').setDescription('Show warning list (admin)').setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('regions').setDescription('Show the Malaysia region leaderboard').toJSON(),

  // keywords
  new SlashCommandBuilder()
    .setName('addkeyword').setDescription('Add blocked keyword (admin)')
    .addStringOption(o => o.setName('word').setDescription('Word to block').setRequired(true))
    .setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('removekeyword').setDescription('Remove blocked keyword (admin)')
    .addStringOption(o => o.setName('word').setDescription('Word to remove').setRequired(true))
    .setDefaultMemberPermissions(adminDefaultPerm).toJSON(),

  new SlashCommandBuilder()
    .setName('listkeywords').setDescription('List blocked keywords (admin)')
    .setDefaultMemberPermissions(adminDefaultPerm).toJSON(),
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🧹 Clearing & registering GUILD commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: commands });
    console.log('✅ Successfully registered application (/) commands.');
  } catch (err) {
    console.error('❌ Deploy failed:', err?.message || err);
    process.exit(1);
  }
})();