// Slash command registration for BusyPang Bot v1.7
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN   = process.env.DISCORD_TOKEN;
const CLIENT  = process.env.CLIENT_ID;
const GUILD   = process.env.GUILD_ID;

if (!TOKEN || !CLIENT || !GUILD) {
  console.error('❌ Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID.');
  process.exit(1);
}

const adminPerm = PermissionFlagsBits.Administrator;

const commands = [
  // Help
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('BusyPang help & commands'),

  // Warnings
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings (yours or another member)')
    .addUserOption(o => o.setName('member').setDescription('Member to check')),

  // Region leaderboard
  new SlashCommandBuilder()
    .setName('regions')
    .setDescription('Show Malaysia Region Leaderboard'),

  // Keyword management
  new SlashCommandBuilder()
    .setName('addkeyword')
    .setDescription('Add a blocked keyword')
    .addStringOption(o => o.setName('word').setDescription('Keyword to block').setRequired(true))
    .setDefaultMemberPermissions(adminPerm),
  new SlashCommandBuilder()
    .setName('removekeyword')
    .setDescription('Remove a blocked keyword')
    .addStringOption(o => o.setName('word').setDescription('Keyword to unblock').setRequired(true))
    .setDefaultMemberPermissions(adminPerm),
  new SlashCommandBuilder()
    .setName('listkeywords')
    .setDescription('List all blocked keywords')
    .setDefaultMemberPermissions(adminPerm),

  // Admin moderation
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (3 warnings = lifetime ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(adminPerm),
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset a member’s warnings to 0')
    .addUserOption(o => o.setName('member').setDescription('Member to reset').setRequired(true))
    .setDefaultMemberPermissions(adminPerm),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately (lifetime)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(adminPerm),
  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user by ID + reset warnings')
    .addStringOption(o => o.setName('user_id').setDescription('User ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(adminPerm),
  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show lifetime ban list (paged)')
    .setDefaultMemberPermissions(adminPerm),
  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show warning list (paged)')
    .setDefaultMemberPermissions(adminPerm),
].map(cmd => cmd.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🧹 Clearing old guild commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: [] });

    console.log('🚀 Registering guild slash commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: commands });

    console.log('✅ Successfully registered all application (/) commands.');
  } catch (err) {
    console.error('❌ Deploy failed:', err?.message || err);
    process.exit(1);
  }
})();