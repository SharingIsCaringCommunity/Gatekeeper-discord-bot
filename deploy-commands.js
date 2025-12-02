// Register guild slash commands (Railway-safe)
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT = process.env.CLIENT_ID;
const GUILD  = process.env.GUILD_ID;

if (!TOKEN || !CLIENT || !GUILD) {
  console.error("❌ Missing env DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const admin = PermissionFlagsBits.Administrator;

const commands = [

  // Help command
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('BusyPang help menu')
    .toJSON(),

  // Everyone
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings (yours or another user)')
    .addUserOption(o => 
      o.setName('member').setDescription('User to check').setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('regions')
    .setDescription('Show Malaysia Region Leaderboard')
    .toJSON(),

  // Admin commands
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(o => 
      o.setName('member').setDescription('User to warn').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset warnings for a user')
    .addUserOption(o =>
      o.setName('member').setDescription('User').setRequired(true))
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban user')
    .addUserOption(o =>
      o.setName('member').setDescription('User to ban').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban user by ID')
    .addStringOption(o =>
      o.setName('user_id').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show ban list')
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show warning list')
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  // Keyword moderation
  new SlashCommandBuilder()
    .setName('addkeyword')
    .setDescription('Add blocked keyword')
    .addStringOption(o =>
      o.setName('word').setDescription('keyword').setRequired(true))
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('removekeyword')
    .setDescription('Remove blocked keyword')
    .addStringOption(o =>
      o.setName('word').setDescription('keyword').setRequired(true))
    .setDefaultMemberPermissions(admin)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('listkeywords')
    .setDescription('List all blocked keywords')
    .setDefaultMemberPermissions(admin)
    .toJSON(),
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log("🧹 Clearing old guild commands…");
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: [] });

    console.log("🚀 Registering new commands…");
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: commands });

    console.log("✅ Slash commands updated.");
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();