const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // your bot application ID
const GUILD_ID  = process.env.GUILD_ID;  // target guild for per-guild commands

const commands = [
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang help & commands')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings for yourself or another user')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('Member to check (optional)')
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (Admins only, 3 warnings = auto-ban)')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('Member to warn')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the warning')
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear warnings for a member (Admins only)')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('Member to clear warnings for')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for clearing warnings')
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member (Admins only)')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('Member to ban')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for banning')
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a member (Admins only)')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('Member to unban')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for pardoning')
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show the lifetime ban list (Admins only, paginated)')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show all members with warnings (Admins only, paginated)')
    .setDMPermission(false),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('⏳ Refreshing slash commands (guild)…');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );
    console.log('✅ Slash commands deployed.');
  } catch (err) {
    console.error('❌ Error deploying commands:', err);
  }
})();