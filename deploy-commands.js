// Registers BusyPang / Gatekeeper slash commands for a single guild.
// Env: DISCORD_TOKEN, CLIENT_ID, GUILD_ID (no dotenv)
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN, CLIENT_ID, and GUILD_ID.');
  process.exit(1);
}

// ---------- Define commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang help & commands'),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings for yourself or a member')
    .addUserOption(o =>
      o.setName('member')
       .setDescription('The member to check (optional)')
       .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (Admins only, 3 warnings = auto-ban)')
    .addUserOption(o =>
      o.setName('member')
       .setDescription('Member to warn')
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('reason')
       .setDescription('Reason for the warning')
       .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset warnings for a member (Admins only)')
    .addUserOption(o =>
      o.setName('member')
       .setDescription('Member whose warnings to clear')
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('reason')
       .setDescription('Reason for clearing warnings')
       .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately (Admins only)')
    .addUserOption(o =>
      o.setName('member')
       .setDescription('Member to ban')
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('reason')
       .setDescription('Reason for the ban')
       .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user and clear warnings (Admins only)')
    .addUserOption(o =>
      o.setName('member')
       .setDescription('User to unban (select by user)')
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('reason')
       .setDescription('Reason for the pardon')
       .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show lifetime ban list (Admins only, paged)'),

  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show warning list (Admins only, paged)'),
].map(c => c.toJSON());

// ---------- Push commands ----------
(async () => {
  try {
    console.log('⏫ Registering slash commands to guild:', GUILD_ID);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to register commands:', err?.message || err);
    process.exit(1);
  }
})();