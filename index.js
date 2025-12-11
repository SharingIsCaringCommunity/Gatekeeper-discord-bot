// index.js
// BusyPang / Gatekeeper — Full runtime
// Requirements: Node >=18, discord.js v14.x, express
// Env vars required:
//   DISCORD_TOKEN, CLIENT_ID (optional for logging), LOG_CHANNEL, STATS_CHANNEL
// Optional:
//   RULES_LINK, FORCE_FETCH_MEMBERS ('true'|'false'), VERIFIED_ROLE_ID,
//   ROLE_ID_1 ... ROLE_ID_15

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===== Read all existing ban rows from Google Sheets =====
// returns a Set of userIds already logged
async function getExistingBanIdsFromSheet() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return new Set();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'BanList!A2:F', // full table except header
    });

    const rows = res.data.values || [];
    const ids = new Set(rows.map(r => r[1])); // column B = userId
    return ids;

  } catch (e) {
    console.error('[Sheets] getExistingBanIdsFromSheet error:', e?.message || e);
    return new Set();
  }
}

// ===== Sync bans from Discord to Google Sheet =====
async function syncExistingBansToSheet(guild) {
  try {
    const existing = await getExistingBanIdsFromSheet();
    const bans = await guild.bans.fetch().catch(() => new Map());

    if (!bans.size) return;

    const rowsToAdd = [];

    for (const [, ban] of bans) {
      const user = ban.user;
      if (!user) continue;

      if (existing.has(user.id)) {
        // Already logged → skip
        continue;
      }

      // New ban → push for sheet insert
      rowsToAdd.push([
        guild.id,
        user.id,
        user.tag,
        'SYSTEM (startup sync)',
        ban.reason || 'No reason',
        'Startup Sync',
        new Date().toISOString()
      ]);
    }

    if (rowsToAdd.length > 0) {
      await appendSheet('BanList!A2', rowsToAdd);
      console.log(`📄 Synced ${rowsToAdd.length} new bans → Google Sheets`);
    } else {
      console.log('✔ BanSheet already up-to-date — no sync needed.');
    }

  } catch (e) {
    console.error('[Sheets] syncExistingBansToSheet error:', e?.message || e);
  }
}

const { google } = require('googleapis');

// ------------------ Google Sheets ------------------
const { google } = require('googleapis');

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY  || '';
const GOOGLE_SHEET_ID     = process.env.GOOGLE_SHEET_ID     || '';

let sheetsClient = null;

function getSheetsClient() {
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    console.warn('[Sheets] Missing GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID');
    return null;
  }
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.JWT(
    GOOGLE_CLIENT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Convert an ISO timestamp / Date to Malaysia time string for human-readable fields.
 * Keeps ISO for raw data storage where needed.
 */
function toMalaysiaTimeIso(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  // use toLocaleString to show MYT
  const iso = d.toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour12: false });
  return iso;
}

// Ensure a sheet (tab) with the given title exists. If missing, create it.
async function ensureSheetExists(sheets, spreadsheetId, title, headerRow = [], headerNote = '') {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsMeta = meta.data.sheets || [];
    const found = sheetsMeta.find(s => s.properties && s.properties.title === title);
    if (found) return found.properties.sheetId;

    // create sheet
    const requests = [
      {
        addSheet: {
          properties: {
            title,
            gridProperties: { rowCount: 1000, columnCount: 12 },
          }
        }
      }
    ];

    // Add the new sheet
    const batchRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });

    const newSheetId = batchRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
    // write header and formatting if provided
    if (headerRow && headerRow.length) {
      // write header and title rows
      const values = [];
      // Row 1: Big Title
      values.push([headerNote || title]);
      // Row 2: blank spacer
      values.push(['']);
      // Row 3: column headers
      values.push(headerRow);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1:${String.fromCharCode(65 + Math.max(0, headerRow.length - 1))}3`,
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      // formatting: make first row big, merge first-row across columns, bold headers, background color
      const headerRangeEndCol = headerRow.length - 1;
      const requestsFormat = [
        // merge first row across header columns
        {
          mergeCells: {
            range: {
              sheetId: newSheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: headerRow.length
            },
            mergeType: 'MERGE_ALL'
          }
        },
        // set big title style
        {
          repeatCell: {
            range: {
              sheetId: newSheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: headerRow.length
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: { bold: true, fontSize: 14 }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
          }
        },
        // header row (row index 2) format
        {
          repeatCell: {
            range: {
              sheetId: newSheetId,
              startRowIndex: 2,
              endRowIndex: 3,
              startColumnIndex: 0,
              endColumnIndex: headerRow.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.15, green: 0.15, blue: 0.15 },
                horizontalAlignment: 'CENTER',
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        },
        // freeze first 3 rows
        {
          updateSheetProperties: {
            properties: {
              sheetId: newSheetId,
              gridProperties: { frozenRowCount: 3 }
            },
            fields: 'gridProperties.frozenRowCount'
          }
        }
      ];

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: requestsFormat }
      });
    }

    return newSheetId;
  } catch (e) {
    console.error('[Sheets] ensureSheetExists error', e?.message || e);
    return null;
  }
}

// Utility to append values then run an auto-sort on date/time column (if requested)
async function appendAndSort(sheets, spreadsheetId, sheetTitle, values, sortColumnIndex = 0) {
  try {
    // append
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetTitle}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    // find sheet id
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const s = (meta.data.sheets || []).find(x => x.properties.title === sheetTitle);
    if (!s) return;
    const sheetId = s.properties.sheetId;

    // apply sort on entire data (from row 4 onward - because we used 1:title,2:spacer,3:headers)
    const requests = [
      {
        sortRange: {
          range: {
            sheetId,
            startRowIndex: 3, // zero-based -> row 4 in spreadsheet
            startColumnIndex: 0,
            endColumnIndex: 20, // large number to cover many columns
          },
          sortSpecs: [
            { dimensionIndex: sortColumnIndex, sortOrder: 'DESCENDING' } // newest first
          ]
        }
      }
    ];

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  } catch (e) {
    console.error('[Sheets] appendAndSort error', e?.message || e);
  }
}

// Replace previous saveSessionToGoogleSheets with this upgraded version
async function saveSessionToGoogleSheets(summaryObj) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return;

    const {
      guildId,
      channelId,
      channelName,
      start,
      end,
      durationMs,
      totalMembers,
      members,
    } = summaryObj;

    // MASTER tabs (ensure exist, with headers and title)
    await ensureSheetExists(sheets, GOOGLE_SHEET_ID, 'VC_Sessions', [
      'Logged At (MYT)', 'Guild ID', 'Channel ID', 'Channel Name', 'Session Start (MYT)', 'Session End (MYT)', 'Duration (ms)', 'Total Members'
    ], 'VC Sessions (master)');

    await ensureSheetExists(sheets, GOOGLE_SHEET_ID, 'VC_Members', [
      'Logged At (MYT)', 'Guild ID', 'Channel ID', 'User ID', 'UsernameTag', 'Time (ms)', 'RejoinCount', 'SessionStart (MYT)', 'SessionEnd (MYT)'
    ], 'VC Members (master)');

    // DAILY sheet (YYYY-MM-DD) inside spreadsheet
    const dayKey = new Date(end).toISOString().slice(0,10); // YYYY-MM-DD
    const dailySheetTitle = `${dayKey}`; // e.g., 2025-12-11
    await ensureSheetExists(sheets, GOOGLE_SHEET_ID, dailySheetTitle, [
      'Logged At (MYT)', 'Guild ID', 'Channel ID', 'Channel Name', 'User ID', 'UsernameTag', 'Time (ms)', 'RejoinCount', 'SessionStart (MYT)', 'SessionEnd (MYT)'
    ], `Daily VC logs — ${dayKey}`);

    // prepare master session row (use Malaysia time string for readability)
    const loggedAtMYT = toMalaysiaTimeIso(new Date());
    const sessionRow = [
      loggedAtMYT,
      guildId,
      channelId,
      channelName,
      toMalaysiaTimeIso(start),
      toMalaysiaTimeIso(end),
      String(durationMs || 0),
      String(totalMembers || 0)
    ];

    // append to VC_Sessions and sort by Logged At
    await appendAndSort(sheets, GOOGLE_SHEET_ID, 'VC_Sessions', [sessionRow], 0);

    // member rows: one per member (also append to master and daily)
    const memberRowsForMaster = (members || []).map(m => [
      loggedAtMYT,
      guildId,
      channelId,
      m.uid,
      m.tag,
      String(m.ms || 0),
      String(m.rejoinCount || 0),
      toMalaysiaTimeIso(m.firstJoinTs || start),
      toMalaysiaTimeIso(m.lastLeaveTs || end)
    ]);

    // append to VC_Members and sort
    if (memberRowsForMaster.length) {
      for (const r of memberRowsForMaster) {
        await appendAndSort(sheets, GOOGLE_SHEET_ID, 'VC_Members', [r], 0);
      }
    }

    // Also append into DAILY sheet
    const memberRowsDaily = (members || []).map(m => [
      loggedAtMYT,
      guildId,
      channelId,
      channelName,
      m.uid,
      m.tag,
      String(m.ms || 0),
      String(m.rejoinCount || 0),
      toMalaysiaTimeIso(m.firstJoinTs || start),
      toMalaysiaTimeIso(m.lastLeaveTs || end)
    ]);
    if (memberRowsDaily.length) {
      for (const r of memberRowsDaily) {
        await appendAndSort(sheets, GOOGLE_SHEET_ID, dailySheetTitle, [r], 0);
      }
    }

    console.log('[Sheets] Saved VC session + members to Google Sheets (master + daily).');
  } catch (e) {
    console.error('[Sheets] saveSessionToGoogleSheets error', e?.message || e);
  }
}

/**
 * Optionally create a simple Dashboard sheet (one-time)
 * - If "Dashboard" sheet exists it will not recreate; you can extend this function.
 */
async function ensureDashboard(sheets) {
  try {
    const spreadsheetId = GOOGLE_SHEET_ID;
    await ensureSheetExists(sheets, spreadsheetId, 'Dashboard', ['Metric', 'Value'], 'VC Dashboard (auto-generated)');
    // populate a simple summary (example: total sessions this month). You can expand with formulas.
    // This is intentionally conservative — more complex charts require adding chart specs with batchUpdate.
  } catch (e) {
    console.error('[Sheets] ensureDashboard error', e?.message || e);
  }
}

// ===== Environment =====
const TOKEN         = process.env.DISCORD_TOKEN;
const LOG_CHANNEL   = process.env.LOG_CHANNEL;   // where join/leave/etc logs go (same channel)
const STATS_CHANNEL = process.env.STATS_CHANNEL; // region leaderboard channel
const RULES_LINK    = process.env.RULES_LINK || '';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || null;
const FORCE_FETCH_MEMBERS = (process.env.FORCE_FETCH_MEMBERS || 'false').toLowerCase() === 'true';

if (!TOKEN || !LOG_CHANNEL || !STATS_CHANNEL) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN, LOG_CHANNEL, STATS_CHANNEL.');
  process.exit(1);
}

// ===== Keepalive (Railway) =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🟢 BusyPang is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates, // important for VC tracking
  ],
});

// ===== In-memory State =====
const bannedUsers = new Set();                 // lifetime ban cache
const warningsByGuild = new Map();             // Map<guildId, Map<userId, count>>
const joinMessageByGuild = new Map();          // Map<guildId, Map<userId, messageId>>
const ADMIN_CMDS = new Set(['warn','ban','pardon','banlist','warnlist','clearwarns','addkeyword','removekeyword','listkeywords']);

const keywordsFile = path.join(__dirname, 'keywords.json');
if (!fs.existsSync(keywordsFile)) fs.writeFileSync(keywordsFile, JSON.stringify([]));
const loadKeywords = () => {
  try { return JSON.parse(fs.readFileSync(keywordsFile, 'utf8') || '[]'); } catch { return []; }
};
const saveKeywords = (arr) => fs.writeFileSync(keywordsFile, JSON.stringify(arr, null, 2));

const isAdmin = (interactionOrMember) => {
  try {
    if (interactionOrMember.memberPermissions) return interactionOrMember.memberPermissions.has(PermissionsBitField.Flags.Administrator);
    if (interactionOrMember.member && interactionOrMember.member.permissions) return interactionOrMember.member.permissions.has(PermissionsBitField.Flags.Administrator);
  } catch {}
  return false;
};

const log = (guild, content) => {
  try {
    const ch = guild.channels.cache.get(LOG_CHANNEL);
    if (ch) ch.send({ content }).catch(() => {});
  } catch {}
};
const getGuildWarnings = (gid) => {
  let m = warningsByGuild.get(gid);
  if (!m) { m = new Map(); warningsByGuild.set(gid, m); }
  return m;
};

// ===== REGION ROLES (read from env ROLE_ID_1...ROLE_ID_15) =====
const REGION_ROLES = {
  [process.env.ROLE_ID_1]: ":house_with_garden: NEGERI SEMBILAN",
  [process.env.ROLE_ID_2]: ":hot_pepper: KELANTAN",
  [process.env.ROLE_ID_3]: ":park: PERAK",
  [process.env.ROLE_ID_4]: ":elephant: PAHANG",
  [process.env.ROLE_ID_5]: ":cityscape: SELANGOR",
  [process.env.ROLE_ID_6]: ":ear_of_rice: KEDAH",
  [process.env.ROLE_ID_7]: ":turtle: TERENGGANU",
  [process.env.ROLE_ID_8]: ":lion_face: JOHOR",
  [process.env.ROLE_ID_9]: ":grapes: PERLIS",
  [process.env.ROLE_ID_10]: ":palm_tree: PENANG",
  [process.env.ROLE_ID_11]: ":anchor: MALACCA",
  [process.env.ROLE_ID_12]: ":orangutan: SARAWAK",
  [process.env.ROLE_ID_13]: ":mountain_snow: SABAH",
  [process.env.ROLE_ID_14]: ":mosque: FEDERAL TERRITORY (KL/PUTRAJAYA/LABUAN)",
  [process.env.ROLE_ID_15]: ":globe_with_meridians: OTHERS",
};

// ===== Helpers =====
function formatMYTTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  }).format(date);
}

function buildRegionEmbed(guild) {
  const regionData = Object.entries(REGION_ROLES)
    .filter(([id]) => id) // skip undefined envs
    .map(([id, label]) => {
      const role = guild.roles.cache.get(id);
      return { label, count: role ? role.members.size : 0 };
    })
    .sort((a,b) => b.count - a.count);

  const medals = ["🏆","🥈","🥉"];
  const lines = regionData.map((r,i) => `${medals[i] || `#${i+1}`} **${r.label}** — ${r.count} member(s)`);
  return new EmbedBuilder()
    .setTitle("🌐 Malaysia Region Leaderboard")
    .setDescription(lines.join('\n') || '_No region roles found._')
    .setColor(0x2ecc71)
    .setFooter({ text: `Last updated: ${formatMYTTime(new Date())}` })
    .setTimestamp();
}

async function updateRegionStats(guild) {
  try {
    if (FORCE_FETCH_MEMBERS) {
      await guild.members.fetch().catch(()=>{});
    }
    const channel = guild.channels.cache.get(STATS_CHANNEL);
    if (!channel) return;
    const embed = buildRegionEmbed(guild);
    const messages = await channel.messages.fetch({ limit: 10 }).catch(()=>[]);
    const botMsg = messages.find(m => m.author && m.author.id === client.user.id);
    if (botMsg) {
      await botMsg.edit({ embeds: [embed] }).catch(()=>{});
    } else {
      await channel.send({ embeds: [embed] }).catch(()=>{});
    }
  } catch (e) {
    console.error('updateRegionStats error', e);
  }
}

// ===== Join/Update/Leave Embeds handling =====
function ensureJoinMap(guildId) {
  let m = joinMessageByGuild.get(guildId);
  if (!m) { m = new Map(); joinMessageByGuild.set(guildId, m); }
  return m;
}

function buildMemberCardEmbed(member, state = 'Joined') {
  // member: GuildMember
  const user = member.user;
  const created = formatMYTTime(user.createdAt);
  const joined = member.joinedAt ? formatMYTTime(member.joinedAt) : '—';
  // find region role label
  const regionRoleId = Object.keys(REGION_ROLES).find(rid => rid && member.roles.cache.has(rid));
  const regionLabel = regionRoleId ? REGION_ROLES[regionRoleId] : 'None';
  const verified = VERIFIED_ROLE_ID && member.roles.cache.has(VERIFIED_ROLE_ID) ? '✅' : '❌';

  const emb = new EmbedBuilder()
    .setTitle(`${state} • ${user.username}`)
    .setColor(state === 'Left' ? 0xff4d4f : 0x00b3ff)
    .setThumbnail(user.displayAvatarURL({ size: 1024 }))
    .addFields(
      { name: 'User', value: `${user.tag}`, inline: true },
      { name: 'User ID', value: `${user.id}`, inline: true },
      { name: 'Account Created', value: `${created}`, inline: false },
      { name: 'Joined Server', value: `${joined}`, inline: true },
      { name: 'Region Role', value: `${regionLabel}`, inline: true },
      { name: 'Verified', value: `${verified}`, inline: true },
    )
    .setFooter({ text: `${state} • ${formatMYTTime(new Date())}` })
    .setTimestamp();
  return emb;
}

// ===== Keyword Moderation (file-based) =====
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const keywords = loadKeywords();
    if (!keywords.length) return;
    const content = (message.content || '').toLowerCase();
    const found = keywords.find(k => k && content.includes(k.toLowerCase()));
    if (found) {
      await message.delete().catch(()=>{});
      await message.channel.send({ content: `🚫 <@${message.author.id}>, your message contained a blocked keyword (\`${found}\`).` }).catch(()=>{});
      if (message.guild) log(message.guild, `🛡️ Blocked message by <@${message.author.id}> in #${message.channel.name} — matched keyword: \`${found}\``);
    }
  } catch (e) {
    console.error('messageCreate error', e);
  }
});

// ===== Presence randomizer (fixed) =====
function setRandomPresence() {
  const activities = [
    { type: 0, name: 'I am BusyBot | /bb' }, // Playing
    { type: 3, name: "you'all 👀" },         // Watching
    { type: 2, name: '/commands 🎶' },       // Listening
  ];
  const a = activities[Math.floor(Math.random() * activities.length)];
  try {
    client.user.setPresence({ activities: [{ name: a.name, type: a.type }], status: 'online' });
  } catch (e) {
    console.error('setPresence failed', e);
  }
}

// ===== Boot / Sync on startup =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Sync bans for all guilds on startup
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch().catch(() => new Map());
      for (const [id] of bans) bannedUsers.add(id);

      console.log(`🔄 Discord banslist loaded: ${bans.size} for ${guild.name}`);

      // Sync ONLY missing bans to Sheets
      await syncExistingBansToSheet(guild);
    } catch (e) {
      console.warn('Failed to sync bans for', guild?.name, e?.message || e);
    }
  }

  // Presence rotation
  setRandomPresence();
  setInterval(setRandomPresence, 10 * 60 * 1000);

  // Update region stats initially
  for (const [, guild] of client.guilds.cache) {
    await updateRegionStats(guild).catch(()=>{});
  }

  // Periodic update
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      await updateRegionStats(guild).catch(()=>{});
    }
  }, 5 * 60 * 1000);

  console.log("🚀 BusyPang fully started.");
});

// keep ban cache in sync
client.on('guildBanAdd', (ban) => bannedUsers.add(ban.user.id));
client.on('guildBanRemove', (ban) => bannedUsers.delete(ban.user.id));

// ===== Member join / leave / update handling =====
client.on('guildMemberAdd', async (member) => {
  try {
    // if user is in lifetime ban cache -> ban immediately
    if (bannedUsers.has(member.id)) {
      try {
        await member.guild.members.ban(member.id, { reason: 'Rejoined after lifetime ban' });
        log(member.guild, `🚫 **${member.user.tag}** tried to rejoin and was re-banned.`);
      } catch (e) {
        log(member.guild, `⚠️ Could not ban ${member.user.tag} on rejoin — check role/permissions.`);
      }
      return;
    }

    // send join embed and store message id for later edit
    const embed = buildMemberCardEmbed(member, 'Joined');
    const ch = member.guild.channels.cache.get(LOG_CHANNEL);
    if (!ch) return;
    const msg = await ch.send({ embeds: [embed] }).catch(()=>null);
    if (msg) {
      const map = ensureJoinMap(member.guild.id);
      map.set(member.id, msg.id);
    }
    log(member.guild, `👋 ${member.user.tag} joined.`);
    // region stats update
    updateRegionStats(member.guild).catch(()=>{});
  } catch (e) {
    console.error('guildMemberAdd error', e);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    // edit the previous join message if present
    const map = ensureJoinMap(newMember.guild.id);
    const msgId = map.get(newMember.id);
    if (msgId) {
      const ch = newMember.guild.channels.cache.get(LOG_CHANNEL);
      if (ch) {
        try {
          const msg = await ch.messages.fetch(msgId).catch(()=>null);
          if (msg) {
            const editedEmbed = buildMemberCardEmbed(newMember, 'Joined & Updated');
            await msg.edit({ embeds: [editedEmbed] }).catch(()=>{});
          }
        } catch {}
      }
    }
    // If region roles changed, update leaderboard
    const regionRoleIds = Object.keys(REGION_ROLES).filter(Boolean);
    const changed = regionRoleIds.some(rid => oldMember.roles.cache.has(rid) !== newMember.roles.cache.has(rid));
    if (changed) await updateRegionStats(newMember.guild);
  } catch (e) {
    console.error('guildMemberUpdate error', e);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    // add to lifetime ban cache and attempt ban-by-id
    bannedUsers.add(member.id);
    try {
      await member.guild.members.ban(member.id, { reason: 'Left the server (lifetime ban)' });
    } catch (e) {
      // ban by id may still succeed; log if failed
      log(member.guild, `⚠️ Could not auto-ban ${member.user.tag} after leaving — check role/permissions.`);
    }

    // send leave embed (new message)
    const embed = buildMemberCardEmbed(member, 'Left');
    const ch = member.guild.channels.cache.get(LOG_CHANNEL);
    if (ch) await ch.send({ embeds: [embed] }).catch(()=>{});

    // remove stored join message id
    const map = ensureJoinMap(member.guild.id);
    map.delete(member.id);

    log(member.guild, `❌ ${member.user.tag} left and was added to lifetime ban list.`);
    updateRegionStats(member.guild).catch(()=>{});
  } catch (e) {
    console.error('guildMemberRemove error', e);
  }
});

// ===== Slash command handler (warnings / bans / regions / keywords) =====
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, guild } = interaction;
    if (!guild) return interaction.reply({ content: 'This command must be used in a server.' });

    // keyword admin commands
if (cmd === 'addkeyword') {
  if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
  const word = interaction.options.getString('word').toLowerCase();
  const arr = loadKeywords();
  if (arr.includes(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` already exists.` });
  arr.push(word); saveKeywords(arr);

  // 🔹 Log to Google Sheets
  logKeywordChange('ADD', word, interaction.user).catch(()=>{});

  return interaction.reply({ content: `✅ Added keyword: \`${word}\`` });
}
if (cmd === 'removekeyword') {
  if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
  const word = interaction.options.getString('word').toLowerCase();
  let arr = loadKeywords();
  if (!arr.includes(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` not found.` });
  arr = arr.filter(x => x !== word); saveKeywords(arr);

  // 🔹 Log to Google Sheets
  logKeywordChange('REMOVE', word, interaction.user).catch(()=>{});

  return interaction.reply({ content: `✅ Removed keyword: \`${word}\`` });
}

    // public: regions
    if (cmd === 'regions') {
      const embed = buildRegionEmbed(guild);
      return interaction.reply({ embeds: [embed] });
    }

    // help / bb
    if (cmd === 'bb') {
      const embed = new EmbedBuilder()
        .setTitle('🤖 BusyPang — Help & Commands')
        .setColor(0x00b3ff)
        .setDescription([
          '### 👥 Everyone',
          '`/warnings [member]` — Check warnings (yourself or another)',
          '`/regions` — Show region leaderboard',
          '`/bb` — Show this help',
          '',
          '### 🛡️ Admin only',
          '`/warn @member [reason]` — Add warning (3 = auto-ban)',
          '`/clearwarns @member` — Reset warnings',
          '`/ban @member [reason]` — Ban immediately',
          '`/pardon user_id` — Unban by ID',
          '`/banlist` — Show ban list',
          '`/warnlist` — Show warning list',
          '',
          '### 🪄 Keywords',
          '`/addkeyword word` — Add blocked word',
          '`/removekeyword word` — Remove blocked word',
          '`/listkeywords` — Show all keywords',
        ].join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    // warnings (anyone can check)
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warnings.` });
    }

// warn (admin)
if (cmd === 'warn') {
  if (!isAdmin(interaction))
    return interaction.reply({ content: '⛔ Admin only.' });

  const user = interaction.options.getUser('member');
  const reason =
    interaction.options.getString('reason') ||
    `Warned by ${interaction.user.tag}`;

  const warnMap = getGuildWarnings(guild.id);
  const current = warnMap.get(user.id) || 0;
  const next = Math.min(3, current + 1);
  warnMap.set(user.id, next);

  // 🔹 Log warn event to Google Sheets
  logWarnEvent(guild, user, interaction.user, reason, next).catch(() => {});

  // 🔹 DM embed to the user
  try {
    const dm = new EmbedBuilder()
      .setTitle('⚠️ You have received a warning')
      .setDescription(`You received a warning in **${guild.name}**.`)
      .addFields(
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Warning Count', value: `${next}/3`, inline: true }
      )
      .setTimestamp();

    if (RULES_LINK) {
      dm.addFields({
        name: '📜 Rules',
        value: `[Click to view rules](${RULES_LINK})`,
        inline: false
      });
    }

    await user.send({ embeds: [dm] }).catch(() => {});
  } catch {}

  // 🔹 Reply in server
  await interaction.reply({
    content: `⚠️ Warned **${user.tag}** — now at **${next}/3** warnings.\n📝 ${reason}`
  });

  log(
    guild,
    `⚠️ ${interaction.user.tag} warned ${user.tag} — ${next}/3 — ${reason}`
  );

  // 🔥 Auto-ban at 3 warnings
  if (next >= 3) {
    bannedUsers.add(user.id);

    try {
      await guild.members.ban(user.id, {
        reason: `Auto-ban at 3 warnings (last: ${reason})`
      });

      // Log ban to Google Sheets
      logBanEvent(
        guild,
        user,
        interaction.user,
        `3 warnings — last: ${reason}`,
        'AUTO_WARN_3'
      ).catch(() => {});

      // DM that they were banned
      try {
        const banDM = new EmbedBuilder()
          .setTitle('🚫 You have been banned')
          .setDescription(
            `You were **banned** from **${guild.name}** due to 3 warnings.`
          )
          .addFields(
            { name: 'Moderator', value: interaction.user.tag, inline: true },
            { name: 'Reason', value: `3 warnings — last: ${reason}`, inline: false },
            { name: 'Type', value: 'Lifetime Ban', inline: true }
          )
          .setTimestamp();

        if (RULES_LINK) {
          banDM.addFields({
            name: '📜 Rules',
            value: `[Server Rules](${RULES_LINK})`,
            inline: false
          });
        }

        await user.send({ embeds: [banDM] }).catch(() => {});
      } catch {}

      await interaction.followUp({
        content: `🚫 **${user.tag}** reached 3/3 warnings and was banned.`
      });

      log(
        guild,
        `🚫 Auto-ban: ${user.tag} banned at 3 warnings (by ${interaction.user.tag}).`
      );
    } catch (e) {
      console.error('Auto-ban error', e);

      await interaction.followUp({
        content: `⚠️ Warning reached 3/3 but I could NOT ban **${user.tag}**. Check bot role permissions.`
      });

      log(
        guild,
        `⚠️ Could not auto-ban ${user.tag} — role/permission issue.`
      );
    }
  }

  return;
}

    // clearwarns (admin)
    if (cmd === 'clearwarns') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const user = interaction.options.getUser('member');
      getGuildWarnings(guild.id).set(user.id, 0);
      await interaction.reply({ content: `🧹 Cleared warnings for **${user.tag}**.` });
      log(guild, `🧹 ${interaction.user.tag} cleared warnings for ${user.tag}.`);
      return;
    }

    // ban (admin)
    if (cmd === 'ban') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        const banDM = new EmbedBuilder()
          .setTitle('🚫 You have been banned')
          .setDescription(`You have been **banned** from **${guild.name}**.`)
          .addFields(
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Type', value: 'Lifetime ban', inline: true },
          )
          .setTimestamp();
        if (RULES_LINK) banDM.addFields({ name: '📜 Rules', value: `[View rules](${RULES_LINK})`, inline: false });
        await user.send({ embeds: [banDM] }).catch(()=>{});
        await interaction.reply({ content: `🚫 Banned **${user.tag}**. 📝 ${reason}` });

        // 🔹 Log manual ban to Google Sheets
        logBanEvent(guild, user, interaction.user, reason, 'MANUAL').catch(()=>{});

        log(guild, `🚫 ${interaction.user.tag} banned ${user.tag} — ${reason}`);
      } catch (e) {
        console.error('ban error', e);
        await interaction.reply({ content: '⚠️ Could not ban that user — check my role position & permissions.' });
      }
      return;
    }

    // pardon (admin) — unban by user ID
    if (cmd === 'pardon') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const userId = interaction.options.getString('user_id');
      const reason = interaction.options.getString('reason') || `Pardon by ${interaction.user.tag}`;
      bannedUsers.delete(userId);
      getGuildWarnings(guild.id).set(userId, 0);
      try {
        await guild.bans.remove(userId, reason);
        let tag = userId;
        try { const u = await client.users.fetch(userId); tag = u.tag || userId; } catch {}
        await interaction.reply({ content: `✅ Pardoned **<@${userId}>** (${tag}). 📝 ${reason}` });
        log(guild, `✅ ${interaction.user.tag} pardoned ${userId} (${tag}) — ${reason}`);
      } catch (e) {
        console.error('pardon error', e);
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    // banlist (admin)
    if (cmd === 'banlist') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const bans = await guild.bans.fetch().catch(()=>new Map());
      const lines = [];
      for (const [id, b] of bans) lines.push(`• **${b.user.tag}** (<@${id}>)`);
      const text = lines.join('\n') || '_No bans._';
      return interaction.reply({ content: `📕 Lifetime Ban List\n\n${text.slice(0,1900)}` });
    }

    // warnlist (admin)
    if (cmd === 'warnlist') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const warnMap = getGuildWarnings(guild.id);
      const entries = [...warnMap.entries()].filter(([,c])=>c>0);
      const lines = [];
      for (const [id,count] of entries) {
        let tag = id;
        try { const u = await client.users.fetch(id); tag = u.tag; } catch {}
        lines.push(`• **${tag}** — ${count}/3 (<@${id}>)`);
      }
      const text = lines.join('\n') || '_No warnings._';
      return interaction.reply({ content: `🧾 Warning List\n\n${text.slice(0,1900)}` });
    }

  } catch (err) {
    console.error('interaction handler error', err);
    if (!interaction.replied) interaction.reply({ content: '❌ Unexpected error. Try again later.' }).catch(()=>{});
  }
});

// ===== Voice Activity Tracker + Monthly Summary =====

// File paths for persistent storage
const VC_ACTIVE_FILE  = path.join(__dirname, 'vc_active_sessions.json');
const VC_LOGS_FILE    = path.join(__dirname, 'vc_logs.json');
const VC_AGG_FILE     = path.join(__dirname, 'vc_aggregates.json');
const VC_MONTHLY_FILE = path.join(__dirname, 'vc_monthly.json');

// Your dedicated VC channels
const VC_STATS_CHANNEL_ID = '1448177256584314982'; // 🎙️-vc-stats-tracker
const VC_LOG_CHANNEL_ID   = '1448175121289187429'; // 🤖-vc-log-recorder

// Fallbacks to env-based channels if needed
const VC_LOG_CHANNEL_FALLBACK   = process.env.VC_LOG_CHANNEL   || LOG_CHANNEL;
const VC_STATS_CHANNEL_FALLBACK = process.env.VC_STATS_CHANNEL || STATS_CHANNEL;

// ---------- JSON helpers ----------
function safeReadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const txt = fs.readFileSync(file, 'utf8') || '';
    return txt ? JSON.parse(txt) : fallback;
  } catch (e) {
    console.error('[VC] JSON read error', file, e);
    return fallback;
  }
}
function safeWriteJSON(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('[VC] JSON write error', file, e);
  }
}

// ---------- Time helpers ----------
function msToHMS(ms) {
  if (!ms || ms <= 0) return '0s';
  const s    = Math.floor(ms / 1000);
  const hrs  = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts = [];
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  if (secs && !hrs) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}
function getYearWeek(d = new Date()) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1)/7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}
function getYearMonth(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}
function monthKeyFromDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function prevMonthKey(d = new Date()) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() - 1);
  return monthKeyFromDate(dt);
}
function monthRangeForKey(key) {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end   = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

// ---------- In-memory VC data ----------
// vcActiveSessions[gid][cid] = {
//   startTs,
//   participants: {
//     [uid]: {
//       totalMs,
//       currentJoinTs,
//       rejoinCount,
//       firstJoinTs,
//       lastLeaveTs
//     }
//   },
//   joinedOrder: [uid, uid, ...] // unique ids, order of first join
// }
let vcActiveSessions   = safeReadJSON(VC_ACTIVE_FILE,  {});
let vcLogsArchive      = safeReadJSON(VC_LOGS_FILE,    []); // per-session logs
// vcAggregates[gid][uid] = { lifetimeMs, weekly: {wkKey:ms}, monthly: {moKey:ms} }
let vcAggregates       = safeReadJSON(VC_AGG_FILE,     {});
let vcMonthlySummaries = safeReadJSON(VC_MONTHLY_FILE, {});

function ensureActiveSession(gid, cid) {
  if (!vcActiveSessions[gid]) vcActiveSessions[gid] = {};
  if (!vcActiveSessions[gid][cid]) {
    vcActiveSessions[gid][cid] = {
      startTs: Date.now(),
      participants: {},
      joinedOrder: [],
    };
  }
  return vcActiveSessions[gid][cid];
}
function ensureAggregate(gid, uid) {
  if (!vcAggregates[gid]) vcAggregates[gid] = {};
  if (!vcAggregates[gid][uid]) {
    vcAggregates[gid][uid] = {
      lifetimeMs: 0,
      weekly: {},
      monthly: {},
    };
  }
  return vcAggregates[gid][uid];
}

// persist everything
function persistAllVC() {
  safeWriteJSON(VC_ACTIVE_FILE,  vcActiveSessions);
  safeWriteJSON(VC_LOGS_FILE,    vcLogsArchive);
  safeWriteJSON(VC_AGG_FILE,     vcAggregates);
  safeWriteJSON(VC_MONTHLY_FILE, vcMonthlySummaries);
}
setInterval(persistAllVC, 30 * 1000);
process.on('exit',   () => persistAllVC());
process.on('SIGINT', () => { persistAllVC(); process.exit(); });
process.on('SIGTERM',() => { persistAllVC(); process.exit(); });

// ---------- Channel helpers ----------
function getAdminVCLogChannel(guild) {
  return (
    guild.channels.cache.get(VC_LOG_CHANNEL_ID) ||
    guild.channels.cache.get(VC_LOG_CHANNEL_FALLBACK) ||
    null
  );
}
function getPublicVCStatsChannel(guild) {
  return (
    guild.channels.cache.get(VC_STATS_CHANNEL_ID) ||
    guild.channels.cache.get(VC_STATS_CHANNEL_FALLBACK) ||
    null
  );
}
async function sendVCAdminLog(guild, embed) {
  try {
    const ch = getAdminVCLogChannel(guild);
    if (!ch) return;
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error('[VC] admin log send error', e);
  }
}
async function sendVCPublicLog(guild, embed) {
  try {
    const ch = getPublicVCStatsChannel(guild);
    if (!ch) return;
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error('[VC] public log send error', e);
  }
}

// ---------- Core: join / leave handlers ----------
function handleVCJoin(guild, channel, user) {
  try {
    const gid = guild.id;
    const cid = channel.id;
    const now = Date.now();
    const session = ensureActiveSession(gid, cid);

    let part = session.participants[user.id];
    const isRejoin = !!part;

    if (!part) {
      part = {
        totalMs: 0,
        currentJoinTs: now,
        rejoinCount: 0,
        firstJoinTs: now,
        lastLeaveTs: null,
      };
      session.participants[user.id] = part;
      if (!session.joinedOrder.includes(user.id)) {
        session.joinedOrder.push(user.id);
      }
    } else {
      // rejoin same session
      part.currentJoinTs = now;
      part.rejoinCount = (part.rejoinCount || 0) + 1;
    }

    vcActiveSessions[gid][cid] = session;
    persistAllVC();

    // Admin per-event log: JOIN / REJOIN
    const joinEmbed = new EmbedBuilder()
      .setTitle(isRejoin ? '🔁 VC Rejoin' : '✅ VC Join')
      .setColor(isRejoin ? 0xfee75c : 0x57f287)
      .setDescription(`<@${user.id}> ${isRejoin ? 'rejoined' : 'joined'} **${channel.name}**`)
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: false },
        { name: 'Channel', value: channel.name, inline: true },
        { name: 'Time', value: formatMYTTime(new Date(now)), inline: true },
      )
      .setTimestamp();

    sendVCAdminLog(guild, joinEmbed);

  } catch (e) {
    console.error('[VC] join error', e);
  }
}

async function handleVCLeave(oldChannel, newChannel, user, guild) {
  try {
    const gid = guild.id;
    const cid = oldChannel?.id;
    if (!cid) return;
    const session = vcActiveSessions?.[gid]?.[cid];
    if (!session) return;

    const now = Date.now();
    const part = session.participants[user.id];
    let thisSessionMs = 0;

    if (part && part.currentJoinTs) {
      const delta = now - part.currentJoinTs;
      part.totalMs = (part.totalMs || 0) + delta;
      part.currentJoinTs = null;
      part.lastLeaveTs = now;

      thisSessionMs = part.totalMs || 0;

      const agg = ensureAggregate(gid, user.id);
      agg.lifetimeMs = (agg.lifetimeMs || 0) + delta;
      const wk = getYearWeek(new Date());
      const mo = getYearMonth(new Date());
      agg.weekly[wk]  = (agg.weekly[wk]  || 0) + delta;
      agg.monthly[mo] = (agg.monthly[mo] || 0) + delta;
      vcAggregates[gid][user.id] = agg;
    }

    const ch = oldChannel;

    // Admin per-event log: LEAVE / MOVE-LEAVE
    if (ch) {
      const leavingForMove = !!newChannel;
      const leaveEmbed = new EmbedBuilder()
        .setTitle(leavingForMove ? '➡️ VC Move (left)' : '❌ VC Leave')
        .setColor(leavingForMove ? 0x5865f2 : 0xed4245)
        .setDescription(
          `<@${user.id}> ${leavingForMove ? 'moved from' : 'left'} **${ch.name}**` +
          (thisSessionMs ? ` — this session: **${msToHMS(thisSessionMs)}**` : '')
        )
        .addFields(
          { name: 'User', value: `${user.tag} (${user.id})`, inline: false },
          { name: 'Channel', value: ch.name, inline: true },
          { name: 'Time', value: formatMYTTime(new Date(now)), inline: true },
        )
        .setTimestamp();

      sendVCAdminLog(guild, leaveEmbed);
    }

    // Channel became empty => finalize this VC session
    if (ch && ch.members && ch.members.size === 0) {
      // Close any still-open participants & aggregate remaining
      for (const [uid, p] of Object.entries(session.participants)) {
        if (p.currentJoinTs) {
          const delta = now - p.currentJoinTs;
          p.totalMs = (p.totalMs || 0) + delta;
          p.currentJoinTs = null;
          p.lastLeaveTs = now;

          const agg = ensureAggregate(gid, uid);
          agg.lifetimeMs = (agg.lifetimeMs || 0) + delta;
          const wk = getYearWeek(new Date());
          const mo = getYearMonth(new Date());
          agg.weekly[wk]  = (agg.weekly[wk]  || 0) + delta;
          agg.monthly[mo] = (agg.monthly[mo] || 0) + delta;
          vcAggregates[gid][uid] = agg;
        }
      }

      const start = new Date(session.startTs);
      const end   = new Date();

      // Build members per-session summary
      let totalMs = 0;
      const membersSummary = [];

      for (const uid of session.joinedOrder) {
        const p = session.participants[uid];
        if (!p) continue;
        totalMs += p.totalMs || 0;
        let tag = `<@${uid}>`;
        try {
          const u = await client.users.fetch(uid).catch(()=>null);
          if (u && u.tag) tag = u.tag;
        } catch {}
        membersSummary.push({
          uid,
          tag,
          ms: p.totalMs || 0,
          rejoinCount: p.rejoinCount || 0,
          firstJoinTs: p.firstJoinTs || session.startTs,
          lastLeaveTs: p.lastLeaveTs || end.getTime(),
        });
      }

      // Who joined first?
      let firstJoin = null;
      for (const m of membersSummary) {
        if (!firstJoin || m.firstJoinTs < firstJoin.firstJoinTs) {
          firstJoin = m;
        }
      }

      // Who stayed longest?
      const longest = [...membersSummary].sort((a,b)=>b.ms-a.ms)[0] || null;

      // Save one session log entry (including rejoin counts)
      const summaryObj = {
        guildId: gid,
        channelId: cid,
        channelName: ch.name,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMs: totalMs,
        totalMembers: membersSummary.length,
        members: membersSummary,
      };
      vcLogsArchive.push(summaryObj);
      // 🔹 Also save VC session + members to Google Sheets
      await saveSessionToGoogleSheets(summaryObj);

      // ---------- ADMIN DETAILED SESSION EMBED ----------
      const adminLines = membersSummary.map((m, i) => {
        return `**${i+1}. ${m.tag}** — ${msToHMS(m.ms)} — joins: ${1 + (m.rejoinCount || 0)} (rejoins: ${m.rejoinCount || 0})`;
      });

      const adminEmbed = new EmbedBuilder()
        .setTitle(`🎧 VC Session Detailed Log — ${ch.name}`)
        .setDescription([
          `**Channel:** ${ch.name}`,
          `**Session start:** ${formatMYTTime(start)}`,
          `**Session end:** ${formatMYTTime(end)}`,
          `**Total members joined:** ${membersSummary.length}`,
          `**Total voice time (sum):** ${msToHMS(totalMs)}`,
          '',
          firstJoin ? `**First to join:** ${firstJoin.tag} (${formatMYTTime(new Date(firstJoin.firstJoinTs))})` : '',
          longest ? `**Longest stay:** ${longest.tag} (${msToHMS(longest.ms)})` : '',
          '',
          '**Participants:**',
        ].filter(Boolean).join('\n'))
        .setColor(0x2b2d31)
        .setTimestamp();

      if (adminLines.length) {
        adminEmbed.addFields({
          name: `Member breakdown (${adminLines.length})`,
          value: adminLines.join('\n').slice(0, 1024),
        });
      }

      await sendVCAdminLog(guild, adminEmbed);

      // ---------- PUBLIC FRIENDLY SESSION EMBED ----------
      const publicTop = [...membersSummary]
        .sort((a,b)=>b.ms-a.ms)
        .slice(0, 5);

      const publicLines = publicTop.map((m, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
        return `${medal} ${m.tag} — ${msToHMS(m.ms)}${m.rejoinCount ? ` (rejoins: ${m.rejoinCount})` : ''}`;
      });

      const totalHours = msToHMS(totalMs);

      const publicEmbed = new EmbedBuilder()
        .setTitle(`🎙️ VC Session Summary — ${ch.name}`)
        .setDescription([
          `**Total participants:** ${membersSummary.length}`,
          `**Total voice time (sum):** ${totalHours}`,
          longest ? `**Longest listener:** ${longest.tag} — ${msToHMS(longest.ms)}` : '',
          '',
          '**Top listeners this session:**',
          publicLines.join('\n') || '_No data_',
        ].filter(Boolean).join('\n'))
        .setColor(0x5865f2)
        .setTimestamp();

      await sendVCPublicLog(guild, publicEmbed);

      // Clear active session
      delete vcActiveSessions[gid][cid];
      if (!Object.keys(vcActiveSessions[gid]).length) delete vcActiveSessions[gid];
      persistAllVC();
    } else {
      vcActiveSessions[gid][cid] = session;
      persistAllVC();
    }
  } catch (e) {
    console.error('[VC] leave error', e);
  }
}

// ---------- Voice state listener ----------
client.on('voiceStateUpdate', (oldState, newState) => {
  try {
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const guild = newState.guild || oldState.guild;
    const user  = newState.member?.user || oldState.member?.user;
    if (!guild || !user) return;

    const joined = !oldChannel && newChannel;
    const left   = oldChannel && !newChannel;
    const moved  = oldChannel && newChannel && oldChannel.id !== newChannel.id;

    if (joined) {
      handleVCJoin(guild, newChannel, user);
    } else if (left) {
      handleVCLeave(oldChannel, null, user, guild);
    } else if (moved) {
      handleVCLeave(oldChannel, newChannel, user, guild);
      handleVCJoin(guild, newChannel, user);
    }
  } catch (e) {
    console.error('[VC] voiceStateUpdate handler error', e);
  }
});

// ---------- Monthly summary builder ----------
function buildMonthlySummaryForKey(guildId, key) {
  const { start, end } = monthRangeForKey(key);
  const sessions = (vcLogsArchive || []).filter(s =>
    s.guildId === guildId &&
    new Date(s.end) >= start &&
    new Date(s.end) <= end
  );

  const perUser = {};
  let totalMs = 0;

  for (const s of sessions) {
    for (const m of s.members || []) {
      if (!perUser[m.uid]) perUser[m.uid] = { ms: 0, sessions: 0, rejoinCount: 0 };
      perUser[m.uid].ms       += (m.ms || 0);
      perUser[m.uid].sessions += 1;
      perUser[m.uid].rejoinCount += (m.rejoinCount || 0);
      totalMs                 += (m.ms || 0);
    }
  }

  const members = Object.entries(perUser)
    .map(([uid, v]) => ({ uid, ms: v.ms, sessions: v.sessions, rejoinCount: v.rejoinCount }))
    .sort((a, b) => b.ms - a.ms);

  return {
    key,
    guildId,
    start: start.toISOString(),
    end: end.toISOString(),
    generatedAt: new Date().toISOString(),
    totalSessions: sessions.length,
    totalMs,
    members,
  };
}

async function monthlyEmbedFromSummary(guild, summary) {
  const start = new Date(summary.start);
  const end   = new Date(summary.end);
  const emb = new EmbedBuilder()
    .setTitle(`📅 Monthly VC Summary — ${guild.name} — ${summary.key}`)
    .setDescription([
      `**Period:** ${formatMYTTime(start)} — ${formatMYTTime(end)}`,
      `**Generated:** ${formatMYTTime(new Date(summary.generatedAt))}`,
      `**Total sessions:** ${summary.totalSessions}`,
      `**Total voice time (sum):** ${msToHMS(summary.totalMs)}`,
      '',
      '**Member breakdown:**',
    ].join('\n'))
    .setColor(0x1abc9c)
    .setTimestamp();

  const lines = [];
  for (const m of summary.members) {
    let tag = `<@${m.uid}>`;
    try {
      const u = await client.users.fetch(m.uid).catch(()=>null);
      if (u && u.tag) tag = u.tag;
    } catch {}
    lines.push(`${tag} — ${msToHMS(m.ms)} (${m.sessions} sessions, ${m.rejoinCount || 0} rejoins)`);
  }

  const fullText = lines.join('\n');
  if (fullText.length <= 3800) {
    emb.addFields({ name: 'All members', value: fullText || '_No data_' });
    return { embed: emb, file: null };
  } else {
    const top25 = lines.slice(0, 25).join('\n');
    emb.addFields({ name: 'Top 25 members', value: top25 || '_No data_' });
    const fileContent = ['Member — Time — Sessions — Rejoins', ...lines].join('\n');
    const buffer = Buffer.from(fileContent, 'utf8');
    return {
      embed: emb,
      file: { name: `vc_monthly_${guild.id}_${summary.key}.txt`, content: buffer },
    };
  }
}

async function postAndSaveMonthlySummary(guild, summary) {
  try {
    if (!vcMonthlySummaries[guild.id]) vcMonthlySummaries[guild.id] = {};
    vcMonthlySummaries[guild.id][summary.key] = summary;
    safeWriteJSON(VC_MONTHLY_FILE, vcMonthlySummaries);

    const { embed, file } = await monthlyEmbedFromSummary(guild, summary);

    // Admin log
    try {
      const adminCh = getAdminVCLogChannel(guild);
      if (adminCh) {
        if (file) {
          await adminCh.send({ embeds: [embed], files: [{ attachment: file.content, name: file.name }] }).catch(()=>{});
        } else {
          await adminCh.send({ embeds: [embed] }).catch(()=>{});
        }
      }
    } catch (e) {
      console.error('[VC][Monthly] admin send error', e);
    }

    // Public stats
    try {
      const statsCh = getPublicVCStatsChannel(guild);
      if (statsCh) {
        if (file) {
          await statsCh.send({ embeds: [embed], files: [{ attachment: file.content, name: file.name }] }).catch(()=>{});
        } else {
          await statsCh.send({ embeds: [embed] }).catch(()=>{});
        }
      }
    } catch (e) {
      console.error('[VC][Monthly] stats send error', e);
    }
  } catch (e) {
    console.error('[VC][Monthly] postAndSave error', e);
  }
}

// Daily check (MYT): if day == 1 -> generate previous month summary
async function runDailyCheck() {
  try {
    const tz = 'Asia/Kuala_Lumpur';
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [y, m, d] = fmt.format(now).split('-').map(Number);
    if (d !== 1) return; // Only act on 1st of month (MYT)

    for (const [, guild] of client.guilds.cache) {
      try {
        const key = prevMonthKey(now);
        if (vcMonthlySummaries[guild.id] && vcMonthlySummaries[guild.id][key]) continue;
        const summary = buildMonthlySummaryForKey(guild.id, key);
        await postAndSaveMonthlySummary(guild, summary);
        console.log(`[VC][Monthly] Generated summary ${key} for guild ${guild.name}`);
      } catch (e) {
        console.error('[VC][Monthly] per-guild error', e);
      }
    }
  } catch (e) {
    console.error('[VC][Monthly] runDailyCheck error', e);
  }
}

// Run once now, then every 24h
runDailyCheck();
setInterval(runDailyCheck, 24 * 60 * 60 * 1000);

// ---------- VC Slash commands (/mystats, /vcleaderboard, /weekly, /session, /monthly) ----------
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const cmd   = interaction.commandName;
    const guild = interaction.guild;
    const user  = interaction.user;
    if (!guild) return;

    // /mystats
    if (cmd === 'mystats') {
      const gid = guild.id;
      const agg = (vcAggregates[gid] && vcAggregates[gid][user.id]) || { lifetimeMs: 0, weekly: {}, monthly: {} };
      const wkKey = getYearWeek(new Date());
      const moKey = getYearMonth(new Date());
      const embed = new EmbedBuilder()
        .setTitle(`📊 VC Stats — ${user.tag}`)
        .addFields(
          { name: 'Lifetime', value: msToHMS(agg.lifetimeMs || 0), inline: true },
          { name: `This week (${wkKey})`, value: msToHMS((agg.weekly && agg.weekly[wkKey]) || 0), inline: true },
          { name: `This month (${moKey})`, value: msToHMS((agg.monthly && agg.monthly[moKey]) || 0), inline: true },
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // /vcleaderboard
    if (cmd === 'vcleaderboard') {
      const gid   = guild.id;
      const wkKey = getYearWeek(new Date());
      const moKey = getYearMonth(new Date());
      const aggGuild = vcAggregates[gid] || {};

      const arr = Object.entries(aggGuild).map(([uid, data]) => ({
        uid,
        lifetime: data.lifetimeMs || 0,
        weekly: (data.weekly && data.weekly[wkKey]) || 0,
        monthly: (data.monthly && data.monthly[moKey]) || 0,
      }));

      const topWeekly  = [...arr].sort((a, b) => b.weekly  - a.weekly).slice(0, 10);
      const topMonthly = [...arr].sort((a, b) => b.monthly - a.monthly).slice(0, 10);

      const wkLines = await Promise.all(topWeekly.map(async (it, i) => {
        let tag = `<@${it.uid}>`;
        try { const u = await client.users.fetch(it.uid); if (u && u.tag) tag = u.tag; } catch {}
        return `**${i+1}.** ${tag} — ${msToHMS(it.weekly)}`;
      }));
      const moLines = await Promise.all(topMonthly.map(async (it, i) => {
        let tag = `<@${it.uid}>`;
        try { const u = await client.users.fetch(it.uid); if (u && u.tag) tag = u.tag; } catch {}
        return `**${i+1}.** ${tag} — ${msToHMS(it.monthly)}`;
      }));

      const embed = new EmbedBuilder()
        .setTitle('🏆 Voice Leaderboards')
        .setDescription(`Top members — Weekly (${wkKey}) & Monthly (${moKey})`)
        .addFields(
          { name: `Weekly — Top ${wkLines.length}`, value: wkLines.join('\n') || '_No data_', inline: true },
          { name: `Monthly — Top ${moLines.length}`, value: moLines.join('\n') || '_No data_', inline: true },
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // /weekly [member?]
    if (cmd === 'weekly') {
      const target = interaction.options.getUser('member') || user;
      const gid    = guild.id;
      const agg = (vcAggregates[gid] && vcAggregates[gid][target.id]) || { lifetimeMs: 0, weekly: {}, monthly: {} };
      const keys = Object.keys(agg.weekly || {}).sort().slice(-6).reverse();
      const lines = keys.map(k => `${k} — ${msToHMS(agg.weekly[k])}`);
      const embed = new EmbedBuilder()
        .setTitle(`📈 Weekly VC Breakdown — ${target.tag}`)
        .setDescription(lines.join('\n') || '_No weekly data_')
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // /session
    if (cmd === 'session') {
      const member = guild.members.cache.get(user.id);
      const ch = member?.voice?.channel;
      if (!ch) return interaction.reply({ content: 'You are not in a voice channel.' });

      const gid = guild.id;
      const cid = ch.id;
      const session = vcActiveSessions?.[gid]?.[cid];
      if (!session) return interaction.reply({ content: 'No active tracking for this channel yet.' });

      const parts = [];
      for (const uid of session.joinedOrder) {
        const p = session.participants[uid];
        if (!p) continue;
        const inNow = p.currentJoinTs ? (Date.now() - p.currentJoinTs) : 0;
        const total = (p.totalMs || 0) + inNow;
        const joins = 1 + (p.rejoinCount || 0);
        parts.push(`${p.currentJoinTs ? '🔴' : '⚪'} <@${uid}> — ${msToHMS(total)} (joins: ${joins})`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔔 Live VC Tracking — ${ch.name}`)
        .setDescription(parts.join('\n') || '_No participants tracked_')
        .setFooter({ text: `Session started: ${formatMYTTime(new Date(session.startTs))}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // /monthly — only after monthly summary has been generated
    if (cmd === 'monthly') {
      const gid = guild.id;
      const key = prevMonthKey(new Date()); // "last month" summary
      const guildSummaries = vcMonthlySummaries[gid] || {};
      if (!guildSummaries[key]) {
        return interaction.reply({
          content: '❌ Sorry, this month’s summary is not ready yet. Please check again at the end of the month.',
        });
      }
      const summary = guildSummaries[key];
      const { embed, file } = await monthlyEmbedFromSummary(guild, summary);
      if (file) {
        return interaction.reply({
          embeds: [embed],
          files: [{ attachment: file.content, name: file.name }],
        });
      } else {
        return interaction.reply({ embeds: [embed] });
      }
    }

  } catch (e) {
    console.error('[VC] interaction handler error', e);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ VC stats error. Try again later.' }).catch(()=>{});
    }
  }
});

// ===== Safety listeners =====
client.on('error', console.error);
client.on('shardError', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// ===== Start =====
client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});