// deploy-commands.js — clear + redeploy slash commands
// Env: DISCORD_TOKEN, CLIENT_ID, GUILD_ID

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID required.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member (Admins only; 3 warnings = auto-ban)")
    .addUserOption(o => o.setName("member").setDescription("Member to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check your warnings or another member’s warnings")
    .addUserOption(o => o.setName("member").setDescription("Member to check").setRequired(false)),

  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Reset a member’s warnings to 0 (Admins only)")
    .addUserOption(o => o.setName("member").setDescription("Member to clear").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member (Admins only)")
    .addUserOption(o => o.setName("member").setDescription("Member to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder()
    .setName("pardon")
    .setDescription("Unban a user and reset warnings (Admins only)")
    .addUserOption(o => o.setName("member").setDescription("User to unban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder()
    .setName("banlist")
    .setDescription("Show all permanently banned users (Admins only)"),

  new SlashCommandBuilder()
    .setName("bb")
    .setDescription("Show BusyPang bot help & commands")
].map(c => c.toJSON());

async function main() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    console.log("🔄 Clearing old guild commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log("✅ Old guild commands cleared.");

    console.log(`📝 Deploying ${commands.length} commands to guild ${GUILD_ID} ...`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Guild commands deployed (instant).");
  } catch (err) {
    console.error("❌ Deploy failed:", err);
    process.exit(1);
  }
}

main();