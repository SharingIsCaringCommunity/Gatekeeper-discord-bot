// Register guild slash commands (no dotenv needed for Railway)
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
  // Help
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('BusyPang help & commands')
    .toJSON(),

  // Everyone: check warnings (optional mention)
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings (yours or another member)')
    .addUserOption(o => o.setName('member').setDescription('Member to check').setRequired(false))
    .toJSON(),

  // Admin: warn
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (3 warnings = lifetime ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // Admin: clear warnings
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset a member’s warnings to 0')
    .addUserOption(o => o.setName('member').setDescription('Member to reset').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // Admin: ban
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately (lifetime)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // Admin: pardon by USER ID (works even if not in server)
  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user by ID + resets warnings to 0 & allows rejoining')
    .addStringOption(o =>
      o.setName('user_id')
       .setDescription('User ID to unban (paste the numeric ID)')
       .setRequired(true)
    )
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // Admin: lifetime ban list (paged)
  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show lifetime ban list (paged)')
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // Admin: warning list (paged)
  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show warning list (paged)')
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🧹 Clearing GUILD commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: [] });

    console.log('🚀 Registering guild slash commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: commands });

    console.log('✅ Successfully registered application (/) commands.');
  } catch (err) {
    console.error('❌ Deploy failed:', err?.message || err);
    process.exit(1);
  }
})();