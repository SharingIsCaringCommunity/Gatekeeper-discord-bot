// ================================
// 🚀 Deploy Slash Commands — BusyPang Bot
// ================================

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT = process.env.CLIENT_ID;   // Bot / Application ID
const GUILD  = process.env.GUILD_ID;    // Guild ID

if (!TOKEN || !CLIENT || !GUILD) {
  console.error('❌ Missing env: DISCORD_TOKEN, CLIENT_ID, GUILD_ID are required.');
  process.exit(1);
}

const adminDefaultPerm = PermissionFlagsBits.Administrator;

const commands = [
  // 🆘 Help
  new SlashCommandBuilder()
    .setName('bb')
    .setDescription('BusyPang help & commands')
    .toJSON(),

  // 👥 Everyone: check warnings
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings (yours or another member)')
    .addUserOption(o => o.setName('member').setDescription('Member to check').setRequired(false))
    .toJSON(),

  // 🌏 Everyone: region leaderboard
  new SlashCommandBuilder()
    .setName('regions')
    .setDescription('Show Malaysia region leaderboard')
    .toJSON(),

  // ⚠️ Admin: warn
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (3 warnings = lifetime ban)')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // 🧹 Admin: clear warnings
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Reset a member’s warnings to 0')
    .addUserOption(o => o.setName('member').setDescription('Member to reset').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // 🚫 Admin: ban
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member immediately (lifetime)')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // ✅ Admin: pardon
  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Unban a user by ID + reset warnings')
    .addStringOption(o =>
      o.setName('user_id')
       .setDescription('User ID to unban')
       .setRequired(true)
    )
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // 📕 Admin: ban list
  new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Show lifetime ban list (paged)')
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // 🧾 Admin: warn list
  new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('Show warning list (paged)')
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // 🛡️ Admin: add keyword (block crypto / scam words)
  new SlashCommandBuilder()
    .setName('addkeyword')
    .setDescription('Add a keyword to the blocklist')
    .addStringOption(o => o.setName('word').setDescription('Keyword to block').setRequired(true))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // ❌ Admin: remove keyword
  new SlashCommandBuilder()
    .setName('removekeyword')
    .setDescription('Remove a keyword from the blocklist')
    .addStringOption(o => o.setName('word').setDescription('Keyword to remove').setRequired(true))
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),

  // 📜 Admin: list keywords
  new SlashCommandBuilder()
    .setName('listkeywords')
    .setDescription('Show all blocked keywords')
    .setDefaultMemberPermissions(adminDefaultPerm)
    .toJSON(),
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🧹 Clearing old guild commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: [] });

    console.log('🚀 Registering guild slash commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT, GUILD), { body: commands });

    console.log('✅ Successfully registered all application (/) commands.');
  } catch (err) {
    console.error('❌ Deploy failed:', err?.message || err);
    process.exit(1);
  }
})();