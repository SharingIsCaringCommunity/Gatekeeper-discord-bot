// Registers guild-only slash commands (no dotenv; uses Railway env).
// Run on deploy or via "npm run deploy" / "npm run railway" (which also starts the bot).

const { REST, Routes } = require('discord.js');

const TOKEN    = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.APPLICATION_ID; // your app ID
const GUILD_ID  = process.env.GUILD_ID;                                // target guild

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Set DISCORD_TOKEN, CLIENT_ID (or APPLICATION_ID), and GUILD_ID.');
  process.exit(1);
}

const commands = [
  {
    name: 'bb',
    description: 'Show BusyPang help & commands',
  },
  {
    name: 'warnings',
    description: 'Check warnings (anyone)',
    options: [
      {
        name: 'member',
        type: 6, // USER
        description: 'User to check (optional)',
        required: false,
      },
    ],
  },
  // Admin-only (visibility is public; permission checks are enforced in index.js)
  {
    name: 'warn',
    description: 'Warn a member (Admins only)',
    options: [
      {
        name: 'member',
        type: 6, // USER
        description: 'Member to warn',
        required: true,
      },
      {
        name: 'reason',
        type: 3, // STRING
        description: 'Reason for the warning',
        required: false,
      },
    ],
  },
  {
    name: 'clearwarns',
    description: 'Reset a member’s warnings to 0 (Admins only)',
    options: [
      {
        name: 'member',
        type: 6, // USER
        description: 'Member to reset',
        required: true,
      },
      {
        name: 'reason',
        type: 3, // STRING
        description: 'Reason for clearing',
        required: false,
      },
    ],
  },
  {
    name: 'ban',
    description: 'Ban a member (Admins only)',
    options: [
      {
        name: 'member',
        type: 6, // USER
        description: 'Member to ban',
        required: true,
      },
      {
        name: 'reason',
        type: 3, // STRING
        description: 'Reason for ban',
        required: false,
      },
    ],
  },
  {
    name: 'pardon',
    description: 'Unban a user by ID (Admins only)',
    options: [
      {
        name: 'user_id',
        type: 3, // STRING (ID input)
        description: 'The user ID to pardon (For resets warnings to 0 & allows rejoining)',
        required: true,
      },
      {
        name: 'reason',
        type: 3, // STRING
        description: 'Reason for pardon',
        required: false,
      },
    ],
  },
  {
    name: 'banlist',
    description: 'Show all permanently banned users (Admins only)',
  },
  {
    name: 'warnlist',
    description: 'Show warning list (Admins only)',
  },
];

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    console.log('🧹 Clearing GUILD commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

    console.log('🚀 Registering guild slash commands…');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

    console.log('✅ Successfully registered application (/) commands.');
  } catch (err) {
    console.error('❌ Deploy failed:', err?.message || err);
    process.exit(1);
  }
})();