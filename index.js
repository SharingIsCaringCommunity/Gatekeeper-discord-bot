// index.js — Gatekeeper v1.3.0 (Slash Commands)
// Requires: discord.js ^14, express

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

// ====== ENV (Railway Variables) ======
const TOKEN = process.env.DISCORD_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL;

// ====== Keepalive (optional pinger) ======
const app = express();
app.get('/', (_req, res) => res.send('Gatekeeper is running.'));
app.listen(3000, () => console.log('✅ Web server running on port 3000'));

// ====== Discord Client ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
  ],
});

// ====== State ======
let bannedUsers = new Set();      // lifetime ban list (synced at startup)
let warnings = new Map();         // userId -> count (in-memory)

// ====== Helper ======
const isAdmin = (member) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator);

const warnCountString = (n) => `${n}/3`;

// ====== Register Slash Commands on Ready ======
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Warn a member (Admins only; 3 warnings = auto-ban)')
      .addUserOption(o =>
        o.setName('member')
         .setDescription('Member to warn')
         .setRequired(true))
      .addStringOption(o =>
        o.setName('reason')
         .setDescription('Reason for the warning')
         .setRequired(false)),

    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Check your warnings or another member’s warnings')
      .addUserOption(o =>
        o.setName('member')
         .setDescription('Member to check (optional)')
         .setRequired(false)),

    new SlashCommandBuilder()
      .setName('clearwarns')
      .setDescription('Reset a member’s warnings to 0 (Admins only)')
      .addUserOption(o =>
        o.setName('member')
         .setDescription('Member to clear warnings for')
         .setRequired(true))
      .addStringOption(o =>
        o.setName('reason')
         .setDescription('Reason')
         .setRequired(false)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member by mention/ID (Admins only)')
      .addUserOption(o =>
        o.setName('member')
         .setDescription('Member to ban')
         .setRequired(true))
      .addStringOption(o =>
        o.setName('reason')
         .setDescription('Reason')
         .setRequired(false)),

    new SlashCommandBuilder()
      .setName('pardon')
      .setDescription('Unban a user by mention/ID (Admins only)')
      .addUserOption(o =>
        o.setName('member')
         .setDescription('User to unban')
         .setRequired(true))
      .addStringOption(o =>
        o.setName('reason')
         .setDescription('Reason')
         .setRequired(false)),

    new SlashCommandBuilder()
      .setName('banlist')
      .setDescription('Show all permanently banned users (Admins only)'),

    new SlashCommandBuilder()
      .setName('gkbot')
      .setDescription('Show Gatekeeper help & commands'),
  ].map(c => c.toJSON());

  await client.application.commands.set(commands);
  console.log('📝 Slash commands registered.');

  const guild = client.guilds.cache.first();
  if (!guild) return console.log('❗ Bot is not in any guild.');
  try {
    const bans = await guild.bans.fetch();
    bannedUsers.clear();
    for (const [id] of bans) bannedUsers.add(id);
    console.log(`🔄 Synced ${bans.size} banned IDs into lifetime list.`);
  } catch (e) {
    console.error('Failed to fetch bans:', e);
  }
});

// ====== Auto actions: join/leave ======
client.on('guildMemberAdd', async (member) => {
  const logCh = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (bannedUsers.has(member.id)) {
    try {
      await member.guild.members.ban(member.id, { reason: 'Rejoined after leaving (lifetime ban)' });
      logCh?.send(`🚫 **${member.user.tag}** tried to rejoin and was banned.\n📝 Reason: Rejoined after leaving`);
    } catch {
      logCh?.send(`⚠️ Could not ban **${member.user.tag}** — missing permissions or bot role too low.`);
    }
  } else {
    logCh?.send(`✅ **${member.user.tag}** joined the server.`);
  }
});

client.on('guildMemberRemove', async (member) => {
  const logCh = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  bannedUsers.add(member.id);
  logCh?.send(`❌ **${member.user.tag}** left.\n🚫 Now banned for life.`);
  try {
    await member.guild.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch {
    logCh?.send(`⚠️ Could not ban **${member.user.tag}** — missing permissions or bot role too low.`);
  }
});

// ====== Slash Command Handling ======
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;
  const guild = interaction.guild;
  const logCh = guild?.channels.cache.get(LOG_CHANNEL_ID);

  const fail = (msg) => interaction.reply({ content: msg, ephemeral: true });

  // /warn
  if (commandName === 'warn') {
    if (!isAdmin(interaction.member)) return fail('❌ Only admins can issue warnings.');
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;

    let count = warnings.get(user.id) || 0;
    count++;
    warnings.set(user.id, count);

    if (count >= 3) {
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason: `Reached 3 warnings: ${reason}` });
        await interaction.reply(`🚫 **${user.tag}** has been banned after 3 warnings.\n📝 Reason: ${reason}`);
        logCh?.send(`🚫 **${interaction.user.tag}** banned **${user.tag}** after 3 warnings.\n📝 Reason: ${reason}`);
      } catch {
        await fail("⚠️ Could not ban this user — check bot's role is above theirs.");
      }
      return;
    }

    await interaction.reply(`⚠️ **${user.tag}** has been warned. (${warnCountString(count)})\n📝 Reason: ${reason}`);
    logCh?.send(`⚠️ **${interaction.user.tag}** warned **${user.tag}** (${warnCountString(count)})\n📝 Reason: ${reason}`);
    return;
  }

  // /warnings
  if (commandName === 'warnings') {
    const user = interaction.options.getUser('member') || interaction.user;
    const count = warnings.get(user.id) || 0;
    await interaction.reply(`📋 **${user.tag}** has ${warnCountString(count)} warnings.`);
    return;
  }

  // /clearwarns
  if (commandName === 'clearwarns') {
    if (!isAdmin(interaction.member)) return fail('❌ Only admins can clear warnings.');
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || `Warnings cleared by ${interaction.user.tag}`;

    warnings.delete(user.id);
    await interaction.reply(`✅ Cleared all warnings for **${user.tag}**.\n📝 Reason: ${reason}`);
    logCh?.send(`✅ **${interaction.user.tag}** cleared warnings for **${user.tag}**\n📝 Reason: ${reason}`);
    return;
  }

  // /ban
  if (commandName === 'ban') {
    if (!isAdmin(interaction.member)) return fail('❌ Only admins can ban.');
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
    bannedUsers.add(user.id);

    try {
      await guild.members.ban(user.id, { reason });
      await interaction.reply(`🚫 Banned **${user.tag}**.\n📝 Reason: ${reason}`);
      logCh?.send(`🚫 **${interaction.user.tag}** banned **${user.tag}**\n📝 Reason: ${reason}`);
    } catch {
      await fail("⚠️ Could not ban this user — check bot's role is above theirs.");
    }
    return;
  }

  // /pardon
  if (commandName === 'pardon') {
    if (!isAdmin(interaction.member)) return fail('❌ Only admins can pardon.');
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || `Pardon issued by ${interaction.user.tag}`;

    bannedUsers.delete(user.id);
    warnings.delete(user.id);

    try {
      await guild.bans.remove(user.id, reason);
      await interaction.reply(`✅ Pardoned **${user.tag}**.\n📝 Reason: ${reason}`);
      logCh?.send(`✅ **${interaction.user.tag}** pardoned **${user.tag}**\n📝 Reason: ${reason}`);
    } catch {
      await fail("⚠️ Could not unban this user — maybe they're not banned?");
    }
    return;
  }

  // /banlist
  if (commandName === 'banlist') {
    if (!isAdmin(interaction.member)) return fail('❌ Only admins can view the ban list.');
    if (bannedUsers.size === 0) return interaction.reply('📋 No users are in the lifetime ban list.');

    const ids = [...bannedUsers];
    const lines = [];
    for (const id of ids) {
      try {
        const u = await client.users.fetch(id);
        lines.push(`**${u.tag}** (${id})`);
      } catch {
        lines.push(`(unknown user) (${id})`);
      }
    }

    const chunks = [];
    let buf = '📋 **Banned Members:**\n';
    for (const line of lines) {
      if ((buf + line + '\n').length > 1900) {
        chunks.push(buf);
        buf = '';
      }
      buf += line + '\n';
    }
    if (buf.length) chunks.push(buf);

    await interaction.reply(chunks.shift());
    for (const chunk of chunks) {
      await interaction.followUp(chunk);
    }
    return;
  }

  // /gkbot
  if (commandName === 'gkbot') {
    const help = new EmbedBuilder()
      .setTitle('🤖 Gatekeeper — Commands')
      .setDescription(
        [
          '`/warn @member [reason]` – Warn a member (3 warnings = auto-ban) **Admin only**',
          '`/warnings [@member]` – Check warnings (anyone)',
          '`/clearwarns @member [reason]` – Reset warnings to 0 **Admin only**',
          '`/ban @member [reason]` – Manual ban **Admin only**',
          '`/pardon @member [reason]` – Unban + reset warnings **Admin only**',
          '`/banlist` – List permanently banned users **Admin only**',
          '`/gkbot` – Show this help',
        ].join('\n')
      )
      .setColor(0xffcc00);
    await interaction.reply({ embeds: [help], ephemeral: true });
    return;
  }
});

// ====== Login ======
client.login(TOKEN);