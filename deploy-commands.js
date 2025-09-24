// deploy-commands.js
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing environment variables. Please set DISCORD_TOKEN, CLIENT_ID, and GUILD_ID.');
  process.exit(1);
}

// --- Define commands ---
const commands = [
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang bot help & commands'),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check your warnings or another member’s warnings')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The member to check')
    ),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (Admins only, 3 warnings = auto-ban)')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
    ),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset a member’s warnings to 0 (Admins only)')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The member to clear warnings for')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for clearing warnings')
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately (Admins only)')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The member to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for ban')
    ),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user and reset warnings (Admins only)')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The member to pardon')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for pardon')
    ),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show all permanently banned users (Admins only)'),

  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show all members with warnings (Admins only)')
].map(cmd => cmd.toJSON());

// --- Deploy ---
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🔄 Clearing old commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [] }
    );

    console.log('🚀 Deploying new commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('✅ Successfully reloaded slash commands.');
  } catch (err) {
    console.error('❌ Error deploying commands:', err);
  }
})();