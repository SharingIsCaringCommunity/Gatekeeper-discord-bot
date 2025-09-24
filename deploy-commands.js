// Deploy guild slash commands so EVERYONE can see them.
// Admin gating is enforced at runtime in index.js.
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;   // Bot/Application ID
const GUILD_ID  = process.env.GUILD_ID;    // Your server ID

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const cmds = [
  // Admin-only to USE (visible to all)
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (Admins only; 3 warnings = auto-ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset a member’s warnings to 0 (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('Member to clear').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user and reset warnings (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('User to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show all permanently banned users (Admins only)')
    .setDMPermission(false),

  // Everyone can use
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check your warnings or another member’s warnings')
    .addUserOption(o => o.setName('member').setDescription('Member to check'))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('Show BusyPang bot help & commands')
    .setDMPermission(false),
].map(c => c.toJSON());

async function run() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  // Optional: clear GLOBAL to avoid duplicates if you ever had them
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('✅ Cleared GLOBAL commands.');
  } catch (e) {
    console.log('ℹ️ Skip GLOBAL clear:', e?.status || '', e?.message || '');
  }

  console.log(`🗺️ Clearing GUILD commands for ${GUILD_ID}...`);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
  console.log('✅ Guild commands cleared.');

  console.log(`🚀 Deploying ${cmds.length} commands to guild ${GUILD_ID}...`);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
  console.log('✅ Guild commands deployed (instant).');
}

run().catch(err => {
  console.error('❌ Deploy failed:', err?.status || '', err?.message || err);
  process.exit(1);
});