// deploy-commands.js — safe deploy: ignore 403 on global clear, deploy GUILD-ONLY
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;   // Application (bot) ID
const GUILD_ID  = process.env.GUILD_ID;    // Your server ID

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('warn')
    .setDescription('Warn a member (Admins only; 3 warnings = auto-ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('warnings')
    .setDescription('Check your warnings or another member’s warnings')
    .addUserOption(o => o.setName('member').setDescription('Member to check')),
  new SlashCommandBuilder().setName('clearwarns')
    .setDescription('Reset a member’s warnings to 0 (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('Member to clear').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('ban')
    .setDescription('Ban a member (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('pardon')
    .setDescription('Unban a user and reset warnings (Admins only)')
    .addUserOption(o => o.setName('member').setDescription('User to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('banlist')
    .setDescription('Show all permanently banned users (Admins only)'),
  new SlashCommandBuilder().setName('bb')
    .setDescription('Show BusyPang bot help & commands'),
].map(c => c.toJSON());

async function main() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  // Try to clear GLOBAL; ignore 403 (wrong client/token) and continue
  try {
    console.log(`🌐 Trying to clear GLOBAL commands for app ${CLIENT_ID} ...`);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('✅ GLOBAL commands cleared.');
  } catch (err) {
    if (err?.status === 403) {
      console.log('ℹ️  Skipping GLOBAL clear (403 unauthorized). Likely CLIENT_ID mismatch or not needed.');
    } else {
      console.log('ℹ️  Skipping GLOBAL clear:', err?.status, err?.message || err);
    }
  }

  // Clear + deploy to your guild (this is what you need)
  console.log(`🗺️  Clearing GUILD commands for ${GUILD_ID} ...`);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
  console.log('✅ GUILD commands cleared.');

  console.log(`🚀 Deploying ${commands.length} commands to guild ${GUILD_ID} ...`);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ Guild commands deployed (instant).');
}

main().catch(err => {
  console.error('❌ Deploy failed:', err?.status || '', err?.message || err);
  process.exit(1);
});