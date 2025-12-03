// deploy-commands.js
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing env: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const adminPerm = PermissionFlagsBits.Administrator;

const commands = [
  new SlashCommandBuilder().setName('bb').setDescription('BusyPang help & commands').toJSON(),

  new SlashCommandBuilder()
    .setName('regions')
    .setDescription('Show Malaysia region leaderboard')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings (yours or another member)')
    .addUserOption(o => o.setName('member').setDescription('Member to check').setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (3 = lifetime ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset a member’s warnings to 0')
    .addUserOption(o => o.setName('member').setDescription('Member to reset').setRequired(true))
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately (lifetime)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user by ID + reset warnings')
    .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show lifetime ban list')
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show warning list (paged)')
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  // keywords management
  new SlashCommandBuilder()
    .setName('addkeyword')
    .setDescription('Add a blocked keyword')
    .addStringOption(o => o.setName('word').setDescription('Keyword to block').setRequired(true))
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('removekeyword')
    .setDescription('Remove a blocked keyword')
    .addStringOption(o => o.setName('word').setDescription('Keyword to remove').setRequired(true))
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('listkeywords')
    .setDescription('List blocked keywords')
    .setDefaultMemberPermissions(adminPerm)
    .toJSON(),
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🧹 Registering guild commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
    process.exit(1);
  }
})();