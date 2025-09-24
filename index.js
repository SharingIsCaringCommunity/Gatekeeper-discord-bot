// Runtime — everyone can SEE replies (no ephemeral).
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

const TOKEN       = process.env.DISCORD_TOKEN;
const LOG_CHANNEL = process.env.LOG_CHANNEL; // channel ID for logs

// --- Keepalive (Railway) ---
const app = express();
app.get('/', (_req, res) => res.send('BusyPang is running.'));
app.listen(3000, () => console.log('✅ Web server running on port 3000'));

// --- Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
});

// Simple in-memory stores
const bannedUsers = new Set();   // lifetime ban IDs
const warnings    = new Map();   // userId -> count

const ADMIN_CMDS = new Set(['warn', 'ban', 'pardon', 'banlist', 'clearwarns']);
const isAdmin = (i) => i.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

const log = (guild, content) => {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch) ch.send({ content }).catch(() => {});
};

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Sync bans for each guild the bot is in
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch();
      bannedUsers.clear();
      for (const [id] of bans) bannedUsers.add(id);
      console.log(`🔄 Synced ${bans.size} bans for ${guild.name}`);
    } catch (e) {
      console.log(`⚠️ Failed to fetch bans for ${guild.name}:`, e?.message || e);
    }
  }
});

// Keep lifetime list updated
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// Auto-ban if a banned user rejoins
client.on('guildMemberAdd', async (member) => {
  const g = member.guild;
  if (bannedUsers.has(member.id)) {
    try {
      await g.members.ban(member.id, { reason: 'Rejoined after leaving (lifetime ban)' });
      log(g, `🚫 **${member.user.tag}** tried to rejoin and was banned.`);
    } catch (e) {
      log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
    }
  } else {
    log(g, `✅ **${member.user.tag}** joined the server.`);
  }
});

// When a member leaves → perma-ban
client.on('guildMemberRemove', async (member) => {
  const g = member.guild;
  bannedUsers.add(member.id);
  log(g, `❌ **${member.user.tag}** left the server — banning for life...`);
  try {
    await g.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
  } catch (e) {
    log(g, `⚠️ Could not ban **${member.user.tag}** — check bot role/permissions.`);
  }
});

// --- Slash Command Handler ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { guild, commandName: cmd } = interaction;

  if (ADMIN_CMDS.has(cmd) && !isAdmin(interaction)) {
    return interaction.reply({
      content: '⚠️ You must be an **Admin** to use this command.'
    });
  }

  try {
    if (cmd === 'bb') {
      const emb = new EmbedBuilder()
        .setTitle('BusyPang — Help & Commands')
        .setColor(0x00b3ff)
        .setDescription(
          [
            '### 👥 Everyone',
            '`/warnings [@user]` — Check warnings',
            '`/bb` — Show this help',
            '',
            '### 🛡️ Admin only',
            '`/warn @user [reason]` — Add warning (3 = auto-ban)',
            '`/clearwarns @user [reason]` — Reset warnings to 0',
            '`/ban @user [reason]` — Ban immediately',
            '`/pardon @user [reason]` — Unban + remove from lifetime list',
            '`/banlist` — Show lifetime ban list',
          ].join('\n')
        );
      return interaction.reply({ embeds: [emb] });
    }

    if (cmd === 'warnings') {
      const user  = interaction.options.getUser('member') || interaction.user;
      const count = warnings.get(user.id) || 0;
      return interaction.reply({
        content: `🧾 Warnings for <@${user.id}>: **${count}/3**`
      });
    }

    if (cmd === 'warn') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const current = warnings.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnings.set(user.id, next);

      await interaction.reply(`⚠️ <@${user.id}> has been warned — now at **${next}/3**. 📝 ${reason}`);
      log(guild, `⚠️ **${interaction.user.tag}** warned <@${user.id}> — ${next}/3. 📝 ${reason}`);

      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (${reason})` });
          log(guild, `🚫 Auto-banned **${user.tag}** (${user.id}) at 3 warnings.`);
        } catch {
          log(guild, `⚠️ Could not auto-ban **${user.tag}** — check role/permissions.`);
        }
      }
      return;
    }

    if (cmd === 'clearwarns') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warnings cleared by ${interaction.user.tag}`;
      warnings.set(user.id, 0);
      await interaction.reply(`🧹 Cleared warnings for <@${user.id}>. 📝 ${reason}`);
      log(guild, `🧹 **${interaction.user.tag}** cleared warnings for <@${user.id}>. 📝 ${reason}`);
      return;
    }

    if (cmd === 'ban') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        await interaction.reply(`🚫 Banned **${user.tag}** (${user.id}). 📝 ${reason}`);
        log(guild, `🚫 **${interaction.user.tag}** banned **${user.tag}** (${user.id}). 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not ban that user (role/permissions?).' });
      }
      return;
    }

    if (cmd === 'pardon') {
      const user   = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Pardoned by ${interaction.user.tag}`;
      bannedUsers.delete(user.id);
      warnings.set(user.id, 0);
      try {
        await guild.bans.remove(user.id, reason);
        await interaction.reply(`✅ <@${user.id}> has been pardoned. 📝 ${reason}`);
        log(guild, `✅ **${interaction.user.tag}** pardoned <@${user.id}>. 📝 ${reason}`);
      } catch {
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    if (cmd === 'banlist') {
      if (bannedUsers.size === 0) {
        return interaction.reply({ content: '📋 No users in the lifetime ban list.' });
      }
      const ids = [...bannedUsers];
      const lines = [];
      for (const id of ids) {
        try {
          const u = await client.users.fetch(id);
          lines.push(`• **${u.tag}** (${id})`);
        } catch {
          lines.push(`• (unknown) (${id})`);
        }
      }
      const text = '📋 **Lifetime Ban List**\n' + lines.join('\n');
      return interaction.reply({ content: text.slice(0, 1990) });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ Unexpected error. Try again.' }).catch(() => {});
    }
  }
});

client.login(TOKEN);