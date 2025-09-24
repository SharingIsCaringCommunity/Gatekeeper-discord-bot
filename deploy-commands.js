// deploy-commands.js — Register all slash commands for BusyPang Bot

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN    = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // your bot's application ID
const GUILD_ID  = process.env.GUILD_ID;  // your server ID (guild)

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in env.");
  process.exit(1);
}

const commands = [

  // /bb (help)
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang help & commands'),

  // /warnings
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check your warnings or another member’s')
    .addUserOption(opt =>
      opt.setName('member')
         .setDescription('Member to check')
    ),

  // /warn
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Add a warning to a member (3 = auto-ban)')
    .addUserOption(opt =>
      opt.setName('member')
         .setDescription('Member to warn')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
         .setDescription('Reason for the warning')
    ),

  // /clearwarns
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset warnings for a member')
    .addUserOption(opt =>
      opt.setName('member')
         .setDescription('Member to clear warnings for')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
         .setDescription('Reason for clearing warnings')
    ),

  // /ban
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately')
    .addUserOption(opt =>
      opt.setName('member')
         .setDescription('Member to ban')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
         .setDescription('Reason for the ban')
    ),

  // /pardon
  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban and remove from lifetime ban list')
    .addUserOption(opt =>
      opt.setName('member')
         .setDescription('Member to pardon')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
         .setDescription('Reason for the pardon')
    ),

  // /banlist
  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show the lifetime ban list'),

  // /warnlist
  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show all members with warnings'),
];

// --- Register ---
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🔄 Refreshing ${commands.length} application (/) commands for guild ${GUILD_ID}...`);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands.map(cmd => cmd.toJSON()) },
    );

    console.log('✅ Successfully registered application (/) commands.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
})();