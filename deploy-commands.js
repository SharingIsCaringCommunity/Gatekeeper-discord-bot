// deploy-commands.js — Registers slash commands for BusyPang

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Missing env vars. Set DISCORD_TOKEN, CLIENT_ID, GUILD_ID.");
  process.exit(1);
}

const commands = [
  // Everyone
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang help & commands'),

  new SlashCommandBuilder()
    .setName('regions')
    .setDescription('Show Malaysia Region Leaderboard'),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings for a member')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('The member to check')
        .setRequired(false)
    ),

  // Admin only
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (3 warnings = auto-ban)')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warnings for a member')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('The member to clear warnings')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('The member to ban')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for ban')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a member by ID')
    .addStringOption(opt =>
      opt.setName('user_id')
        .setDescription('The user ID to unban')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show ban list'),

  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show warning list'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('⏳ Refreshing application (/) commands...');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (err) {
    console.error('❌ Failed to deploy commands:', err);
  }
})();
