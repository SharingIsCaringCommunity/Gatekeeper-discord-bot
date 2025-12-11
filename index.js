// index.js (single-file BusyPang with Google Sheets only storage)
// Requirements: Node >=18, discord.js v14.x, express, googleapis
// Env (required): DISCORD_TOKEN, LOG_CHANNEL, STATS_CHANNEL, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID
// Optional: RULES_LINK, VERIFIED_ROLE_ID, FORCE_FETCH_MEMBERS ('true'|'false'), VC_LOG_CHANNEL, VC_STATS_CHANNEL, ROLE_ID_1...ROLE_ID_15

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');
const express = require('express');
const { google } = require('googleapis');
const process = require('process');

// ------------------- ENV -------------------
const TOKEN         = process.env.DISCORD_TOKEN;
const LOG_CHANNEL   = process.env.LOG_CHANNEL;
const STATS_CHANNEL = process.env.STATS_CHANNEL;
const RULES_LINK    = process.env.RULES_LINK || '';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || null;
const FORCE_FETCH_MEMBERS = (process.env.FORCE_FETCH_MEMBERS || 'false').toLowerCase() === 'true';

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY  || '';
const GOOGLE_SHEET_ID     = process.env.GOOGLE_SHEET_ID     || '';

if (!TOKEN || !LOG_CHANNEL || !STATS_CHANNEL) {
  console.error('❌ Missing env vars. Set DISCORD_TOKEN, LOG_CHANNEL, STATS_CHANNEL.');
  process.exit(1);
}
if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
  console.warn('⚠️ Google Sheets not fully configured. Sheets features will be disabled until GOOGLE_* env vars are set.');
}

// ------------------- Google Sheets helper -------------------
let sheetsClient = null;
function getSheetsClient() {
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) return null;
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

// Helper to format Malaysia time human-readable
function toMalaysiaTimeIso(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  // e.g. "2025-12-11 23:59:59 (MYT)"
  const local = d.toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour12: false });
  return local;
}
function toIso(date) {
  return (date instanceof Date ? date : new Date(date)).toISOString();
}

// Ensure sheet exists and create headers + title row + formatting
async function ensureSheetExists(sheetTitle, headerRow = [], headerNote = '') {
  const sheets = getSheetsClient();
  if (!sheets) return null;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
    const found = (meta.data.sheets || []).find(s => s.properties && s.properties.title === sheetTitle);
    if (found) return found.properties.sheetId;

    // create sheet
    const addReq = [{
      addSheet: {
        properties: {
          title: sheetTitle,
          gridProperties: { rowCount: 2000, columnCount: Math.max(12, headerRow.length + 2) }
        }
      }
    }];
    const batch = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: { requests: addReq }
    });
    const sheetId = batch.data.replies?.[0]?.addSheet?.properties?.sheetId;

    // Prepare title + blank + headers
    const values = [];
    values.push([headerNote || sheetTitle]);
    values.push(['']); // spacer row
    values.push(headerRow);

    const endCol = String.fromCharCode(65 + Math.max(0, headerRow.length - 1));
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetTitle}!A1:${endCol}3`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });

    // formatting: merge title row, style title and header, freeze rows
    const formatReqs = [
      {
        mergeCells: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headerRow.length },
          mergeType: 'MERGE_ALL'
        }
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headerRow.length },
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
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: headerRow.length },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.12, blue: 0.12 },
              horizontalAlignment: 'CENTER',
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
        }
      },
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 3 } },
          fields: 'gridProperties.frozenRowCount'
        }
      }
    ];

    await sheets.spreadsheets.batchUpdate({ spreadsheetId: GOOGLE_SHEET_ID, requestBody: { requests: formatReqs } });
    console.log(`[Sheets] Created sheet "${sheetTitle}" with headers.`);
    return sheetId;

  } catch (e) {
    console.error('[Sheets] ensureSheetExists error', e?.message || e);
    return null;
  }
}

// Append and auto-sort (sort by column index; 0 == first data column we use 'Logged At')
async function appendAndSort(sheetTitle, rows, sortColumnIndex = 0) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetTitle}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows }
    });

    // get sheet id
    const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
    const sheet = (meta.data.sheets || []).find(s => s.properties.title === sheetTitle);
    if (!sheet) return;
    const sheetId = sheet.properties.sheetId;

    const requests = [
      {
        sortRange: {
          range: {
            sheetId,
            startRowIndex: 3,
            startColumnIndex: 0,
            endColumnIndex: Math.min(40, (sheet.properties.gridProperties && sheet.properties.gridProperties.columnCount) || 40)
          },
          sortSpecs: [{ dimensionIndex: sortColumnIndex, sortOrder: 'DESCENDING' }]
        }
      }
    ];
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: GOOGLE_SHEET_ID, requestBody: { requests } });
  } catch (e) {
    console.error('[Sheets] appendAndSort error', e?.message || e);
  }
}

// Read a sheet range (returns values)
async function readRange(sheetTitle, range = 'A1:Z1000') {
  const sheets = getSheetsClient();
  if (!sheets) return [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetTitle}!${range}`
    });
    return res.data.values || [];
  } catch (e) {
    // if sheet doesn't exist, return []
    return [];
  }
}

// ------------------- In-memory storage (no JSON) -------------------
// We'll keep bans, warnings, keywords, VC active sessions, VC aggregates, VC logs, monthly summaries in memory.
// On startup we will load existing rows from Sheets into these structures.

const bannedUsers = new Set();
const warningsByGuild = new Map(); // Map<guildId, Map<userId, count>>
const keywordsByGuild = new Map(); // Map<guildId, Set<word>>
let vcActiveSessions = {}; // as previously: vcActiveSessions[gid][cid] = { startTs, participants, joinedOrder }
let vcLogsArchive = []; // array of session summaries
let vcAggregates = {}; // vcAggregates[gid][uid] = { lifetimeMs, weekly: {}, monthly: {} }
let vcMonthlySummaries = {}; // vcMonthlySummaries[gid][key] = summary

function getGuildWarnings(gid) {
  if (!warningsByGuild.has(gid)) warningsByGuild.set(gid, new Map());
  return warningsByGuild.get(gid);
}
function getGuildKeywords(gid) {
  if (!keywordsByGuild.has(gid)) keywordsByGuild.set(gid, new Set());
  return keywordsByGuild.get(gid);
}

function ensureActiveSession(gid, cid) {
  if (!vcActiveSessions[gid]) vcActiveSessions[gid] = {};
  if (!vcActiveSessions[gid][cid]) vcActiveSessions[gid][cid] = { startTs: Date.now(), participants: {}, joinedOrder: [] };
  return vcActiveSessions[gid][cid];
}
function ensureAggregate(gid, uid) {
  if (!vcAggregates[gid]) vcAggregates[gid] = {};
  if (!vcAggregates[gid][uid]) vcAggregates[gid][uid] = { lifetimeMs: 0, weekly: {}, monthly: {} };
  return vcAggregates[gid][uid];
}

// ------------------- Sheets-backed helpers (load on startup) -------------------

// Load existing BanList into memory set
async function loadBanListFromSheet() {
  const rows = await readRange('BanList', 'A2:G10000');
  for (const r of rows) {
    // Expect: guildId | userId | username | moderator | reason | banType | at
    const userId = r[1];
    if (userId) bannedUsers.add(userId);
  }
  console.log(`[Sheets] Loaded ${bannedUsers.size} bans into memory.`);
}

// Load keywords per guild: from "Keywords" sheet columns: keyword | action | byTag | byId | at
async function loadKeywordsFromSheet() {
  const rows = await readRange('Keywords', 'A2:E10000');
  for (const r of rows) {
    const word = r[0];
    const byId = r[3];
    // byId may be the userId or guild; we used 'byId' loosely. We'll treat keywords as global across guild, but we store per-guild if byId is numeric guild id.
    // If you want per-guild keywords, change uploader to include guildId in column.
    if (!word) continue;
    // store globally for now in key 'global'
    const gset = getGuildKeywords('global');
    gset.add(word.toLowerCase());
  }
  console.log('[Sheets] Loaded keywords (global) from sheet.');
}

// Load VC_Members and VC_Sessions into memory to build aggregates and historical logs
async function loadVCDataFromSheets() {
  // Load vcSessions
  const sessions = await readRange('VC_Sessions', 'A4:Z10000'); // data starts row 4
  vcLogsArchive = [];
  for (const r of sessions) {
    // we expect: LoggedAt(MYT), guildId, channelId, channelName, sessionStart(MYT), sessionEnd(MYT), durationMs, totalMembers
    if (!r[1]) continue;
    const summary = {
      guildId: r[1],
      channelId: r[2],
      channelName: r[3],
      start: new Date(r[4]).toISOString ? (new Date(r[4]).toISOString()) : new Date(r[4]).toISOString(),
      end: new Date(r[5]).toISOString ? (new Date(r[5]).toISOString()) : new Date(r[5]).toISOString(),
      durationMs: Number(r[6] || 0),
      totalMembers: Number(r[7] || 0),
      members: []
    };
    vcLogsArchive.push(summary);
  }

  // Load members
  const members = await readRange('VC_Members', 'A4:Z50000');
  for (const r of members) {
    // LoggedAt, guildId, channelId, userId, usernameTag, timeMs, rejoinCount, sessionStart, sessionEnd
    const gid = r[1];
    const cid = r[2];
    const uid = r[3];
    const tag = r[4] || `<@${uid}>`;
    const ms = Number(r[5] || 0);
    const rejoinCount = Number(r[6] || 0);
    if (!gid || !uid) continue;
    const agg = ensureAggregate(gid, uid);
    agg.lifetimeMs = (agg.lifetimeMs || 0) + ms;
    // weekly/monthly maps not reconstructed here (we could parse sessionStart to add to month/week buckets)
    // but we will not reconstruct weekly/monthly buckets perfectly from member rows to keep startup simple.
  }

  // Build aggregates more thoroughly by iterating vcLogsArchive if members included (but our VC_Sessions load above does not have members)
  // If you want perfect reconstruction, store members inside VC_Sessions or a JSON blob. For now we keep lifetimeMs aggregated from VC_Members.
  console.log(`[Sheets] Loaded ${vcLogsArchive.length} VC sessions (master rows) and built basic aggregates.`);
}

// Load warn list for warnings history (WarnList!A:G)
async function loadWarnsFromSheet() {
  const rows = await readRange('WarnList', 'A2:G10000');
  for (const r of rows) {
    // guildId | userId | username | moderator | reason | warningCount | at
    const gid = r[0];
    const uid = r[1];
    const count = Number(r[5] || 0);
    if (!gid || !uid) continue;
    const w = getGuildWarnings(gid);
    w.set(uid, Math.max(w.get(uid) || 0, count));
  }
  console.log('[Sheets] Loaded warnings into memory.');
}

// Load monthly summaries if present (Dashboard not required)
async function loadMonthlySummariesFromSheet() {
  // Our implementation stores monthly summaries in sheet VC_Monthly (optional) OR in Dashboard. We'll look for VC_Monthly sheet with CSV lines.
  // If you wish to store full JSON summaries in a 'VC_MonthLY_JSON' sheet, implement serialization there.
  console.log('[Sheets] Monthly summary loading: none to load by default.');
}

// Top-level startup loader
async function loadAllFromSheets() {
  const s = getSheetsClient();
  if (!s) {
    console.warn('[Sheets] Sheets client not available — skipping load.');
    return;
  }
  // Ensure required master sheets exist (safe: will create if missing)
  await ensureSheetExists('BanList', ['Guild ID', 'User ID', 'Username', 'Moderator', 'Reason', 'BanType', 'Logged At'], 'Ban list (lifetime)');
  await ensureSheetExists('WarnList', ['Guild ID', 'User ID', 'Username', 'Moderator', 'Reason', 'WarningCount', 'Logged At'], 'Warn events');
  await ensureSheetExists('Keywords', ['Keyword', 'Action', 'ByTag', 'ById', 'At'], 'Keywords (blocked)');
  await ensureSheetExists('VC_Sessions', ['Logged At (MYT)', 'Guild ID', 'Channel ID', 'Channel Name', 'Session Start (MYT)', 'Session End (MYT)', 'Duration (ms)', 'Total Members'], 'VC Sessions (master)');
  await ensureSheetExists('VC_Members', ['Logged At (MYT)', 'Guild ID', 'Channel ID', 'User ID', 'UsernameTag', 'Time (ms)', 'RejoinCount', 'SessionStart (MYT)', 'SessionEnd (MYT)'], 'VC Members (master)');
  await ensureSheetExists('Dashboard', ['Metric', 'Value'], 'VC Dashboard (auto-generated)');

  // Now load data
  await Promise.all([
    loadBanListFromSheet(),
    loadWarnsFromSheet(),
    loadKeywordsFromSheet(),
    loadVCDataFromSheets(),
    loadMonthlySummariesFromSheet()
  ]);
}

// ------------------- Logging to Sheets (write functions) -------------------

async function appendBanToSheet(guild, targetUser, moderatorUser, reason, type) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  try {
    const row = [
      toMalaysiaTimeIso(new Date()),
      guild?.id || 'unknown',
      targetUser?.id || 'unknown',
      targetUser?.tag || 'unknown',
      moderatorUser?.tag || 'unknown',
      reason || '',
      type || '',
    ];
    await appendAndSort('BanList', [row], 0);
  } catch (e) { console.error('[Sheets] appendBanToSheet', e); }
}

async function logWarnEventToSheet(guild, targetUser, moderatorUser, reason, count) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  try {
    const row = [
      guild?.id || 'unknown',
      targetUser?.id || 'unknown',
      targetUser?.tag || 'unknown',
      moderatorUser?.tag || 'unknown',
      reason || '',
      String(count || ''),
      toMalaysiaTimeIso(new Date())
    ];
    await appendAndSort('WarnList', [row], 6); // sort by LoggedAt (last column)
  } catch (e) { console.error('[Sheets] logWarnEventToSheet', e); }
}

async function logKeywordChangeToSheet(action, word, user) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  try {
    const row = [
      (word || ''),
      action || '',
      user?.tag || '',
      user?.id || '',
      toMalaysiaTimeIso(new Date())
    ];
    await appendAndSort('Keywords', [row], 4);
  } catch (e) { console.error('[Sheets] logKeywordChangeToSheet', e); }
}

// Save VC session + members to master and daily sheets (no JSON)
async function saveSessionToGoogleSheets(summaryObj) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  try {
    // ensure masters + daily
    await ensureSheetExists('VC_Sessions', ['Logged At (MYT)', 'Guild ID', 'Channel ID', 'Channel Name', 'Session Start (MYT)', 'Session End (MYT)', 'Duration (ms)', 'Total Members'], 'VC Sessions (master)');
    await ensureSheetExists('VC_Members', ['Logged At (MYT)', 'Guild ID', 'Channel ID', 'User ID', 'UsernameTag', 'Time (ms)', 'RejoinCount', 'SessionStart (MYT)', 'SessionEnd (MYT)'], 'VC Members (master)');

    const { guildId, channelId, channelName, start, end, durationMs, totalMembers, members } = summaryObj;
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
    await appendAndSort('VC_Sessions', [sessionRow], 0);

    // append each member to VC_Members
    if (Array.isArray(members) && members.length) {
      const memberRows = members.map(m => [
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
      for (const r of memberRows) await appendAndSort('VC_Members', [r], 0);

      // Also append to daily sheet (YYYY-MM-DD)
      const dayKey = new Date(end).toISOString().slice(0, 10);
      const dailyTitle = `${dayKey}`;
      await ensureSheetExists(dailyTitle, ['Logged At (MYT)', 'Guild ID', 'Channel ID', 'Channel Name', 'User ID', 'UsernameTag', 'Time (ms)', 'RejoinCount', 'SessionStart (MYT)', 'SessionEnd (MYT)'], `Daily VC logs — ${dayKey}`);
      const dailyRows = members.map(m => [
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
      for (const r of dailyRows) await appendAndSort(dailyTitle, [r], 0);
    }

    // update in-memory aggregates
    if (Array.isArray(members)) {
      for (const m of members) {
        const agg = ensureAggregate(guildId, m.uid);
        agg.lifetimeMs = (agg.lifetimeMs || 0) + (m.ms || 0);
        const wk = getYearWeek(new Date());
        const mo = getYearMonth(new Date());
        agg.weekly[wk] = (agg.weekly[wk] || 0) + (m.ms || 0);
        agg.monthly[mo] = (agg.monthly[mo] || 0) + (m.ms || 0);
      }
    }
    console.log('[Sheets] Saved VC session + members to Sheets (master + daily).');
  } catch (e) {
    console.error('[Sheets] saveSessionToGoogleSheets error', e?.message || e);
  }
}

// ------------------- Utilities for date/week/month helpers -------------------
function msToHMS(ms) {
  if (!ms || ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const hrs = Math.floor(s / 3600);
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

// ------------------- Discord bot logic (main) -------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// region roles mapping (read env ROLE_ID_N)
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

// helpers
function isAdmin(interactionOrMember) {
  try {
    if (interactionOrMember.memberPermissions) return interactionOrMember.memberPermissions.has(PermissionsBitField.Flags.Administrator);
    if (interactionOrMember.member && interactionOrMember.member.permissions) return interactionOrMember.member.permissions.has(PermissionsBitField.Flags.Administrator);
  } catch {}
  return false;
}
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
    .filter(([id]) => id)
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
    if (FORCE_FETCH_MEMBERS) await guild.members.fetch().catch(()=>{});
    const channel = guild.channels.cache.get(STATS_CHANNEL);
    if (!channel) return;
    const embed = buildRegionEmbed(guild);
    const messages = await channel.messages.fetch({ limit: 10 }).catch(()=>[]);
    const botMsg = messages.find(m => m.author && m.author.id === client.user.id);
    if (botMsg) await botMsg.edit({ embeds: [embed] }).catch(()=>{});
    else await channel.send({ embeds: [embed] }).catch(()=>{});
  } catch (e) {
    console.error('updateRegionStats error', e);
  }
}

// join/leave embeds
function buildMemberCardEmbed(member, state = 'Joined') {
  const user = member.user;
  const created = formatMYTTime(user.createdAt);
  const joined = member.joinedAt ? formatMYTTime(member.joinedAt) : '—';
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

// message keyword moderation (global 'global' keywords)
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const gset = getGuildKeywords('global');
    if (!gset || !gset.size) return;
    const content = (message.content || '').toLowerCase();
    for (const kw of gset) {
      if (!kw) continue;
      if (content.includes(kw)) {
        await message.delete().catch(()=>{});
        await message.channel.send({ content: `🚫 <@${message.author.id}>, your message contained a blocked keyword (\`${kw}\`).` }).catch(()=>{});
        if (message.guild) {
          try {
            const ch = message.guild.channels.cache.get(LOG_CHANNEL);
            if (ch) ch.send(`🛡️ Blocked message by <@${message.author.id}> in #${message.channel.name} — matched keyword: \`${kw}\``).catch(()=>{});
          } catch {}
        }
        break;
      }
    }
  } catch (e) { console.error('messageCreate error', e); }
});

// presence
function setRandomPresence() {
  const activities = [
    { type: 0, name: 'I am BusyBot | /bb' },
    { type: 3, name: "you'all 👀" },
    { type: 2, name: '/commands 🎶' },
  ];
  const a = activities[Math.floor(Math.random() * activities.length)];
  try { client.user.setPresence({ activities: [{ name: a.name, type: a.type }], status: 'online' }); } catch {}
}

// ---------- VC Tracking internals ----------
const VC_STATS_CHANNEL_ID = process.env.VC_STATS_CHANNEL || STATS_CHANNEL;
const VC_LOG_CHANNEL_ID   = process.env.VC_LOG_CHANNEL || LOG_CHANNEL;

function getAdminVCLogChannel(guild) {
  return guild.channels.cache.get(VC_LOG_CHANNEL_ID) || null;
}
function getPublicVCStatsChannel(guild) {
  return guild.channels.cache.get(VC_STATS_CHANNEL_ID) || null;
}
async function sendVCAdminLog(guild, embed) {
  try { const ch = getAdminVCLogChannel(guild); if (ch) await ch.send({ embeds: [embed] }).catch(()=>{}); } catch (e) { console.error('[VC] admin send error', e); }
}
async function sendVCPublicLog(guild, embed) {
  try { const ch = getPublicVCStatsChannel(guild); if (ch) await ch.send({ embeds: [embed] }).catch(()=>{}); } catch (e) { console.error('[VC] public send error', e); }
}

function handleVCJoin(guild, channel, user) {
  try {
    const gid = guild.id, cid = channel.id, now = Date.now();
    const session = ensureActiveSession(gid, cid);
    let part = session.participants[user.id];
    const isRejoin = !!part;
    if (!part) {
      part = { totalMs: 0, currentJoinTs: now, rejoinCount: 0, firstJoinTs: now, lastLeaveTs: null };
      session.participants[user.id] = part;
      if (!session.joinedOrder.includes(user.id)) session.joinedOrder.push(user.id);
    } else {
      part.currentJoinTs = now;
      part.rejoinCount = (part.rejoinCount || 0) + 1;
    }
    // admin log
    const joinEmbed = new EmbedBuilder()
      .setTitle(isRejoin ? '🔁 VC Rejoin' : '✅ VC Join')
      .setColor(isRejoin ? 0xfee75c : 0x57f287)
      .setDescription(`<@${user.id}> ${isRejoin ? 'rejoined' : 'joined'} **${channel.name}**`)
      .addFields({ name: 'User', value: `${user.tag} (${user.id})`, inline: false }, { name: 'Channel', value: channel.name, inline: true }, { name: 'Time', value: formatMYTTime(new Date(now)), inline: true })
      .setTimestamp();
    sendVCAdminLog(guild, joinEmbed);
  } catch (e) { console.error('[VC] join error', e); }
}

async function handleVCLeave(oldChannel, newChannel, user, guild) {
  try {
    const gid = guild.id, cid = oldChannel?.id;
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
      agg.weekly[wk] = (agg.weekly[wk] || 0) + delta;
      agg.monthly[mo] = (agg.monthly[mo] || 0) + delta;
    }

    // admin leave embed
    const ch = oldChannel;
    if (ch) {
      const leavingForMove = !!newChannel;
      const leaveEmbed = new EmbedBuilder()
        .setTitle(leavingForMove ? '➡️ VC Move (left)' : '❌ VC Leave')
        .setColor(leavingForMove ? 0x5865f2 : 0xed4245)
        .setDescription(`<@${user.id}> ${leavingForMove ? 'moved from' : 'left'} **${ch.name}**` + (thisSessionMs ? ` — this session: **${msToHMS(thisSessionMs)}**` : ''))
        .addFields({ name: 'User', value: `${user.tag} (${user.id})`, inline: false }, { name: 'Channel', value: ch.name, inline: true }, { name: 'Time', value: formatMYTTime(new Date(now)), inline: true })
        .setTimestamp();
      sendVCAdminLog(guild, leaveEmbed);
    }

    // if channel empty => finalize session
    if (ch && ch.members && ch.members.size === 0) {
      // finalize all participants
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
          agg.weekly[wk] = (agg.weekly[wk] || 0) + delta;
          agg.monthly[mo] = (agg.monthly[mo] || 0) + delta;
        }
      }

      const start = new Date(session.startTs);
      const end   = new Date();
      const membersSummary = [];
      let totalMs = 0;
      for (const uid of session.joinedOrder) {
        const p = session.participants[uid];
        if (!p) continue;
        totalMs += p.totalMs || 0;
        let tag = `<@${uid}>`;
        try { const u = await client.users.fetch(uid).catch(()=>null); if (u && u.tag) tag = u.tag; } catch {}
        membersSummary.push({ uid, tag, ms: p.totalMs || 0, rejoinCount: p.rejoinCount || 0, firstJoinTs: p.firstJoinTs || session.startTs, lastLeaveTs: p.lastLeaveTs || end.getTime() });
      }

      const summaryObj = {
        guildId: gid,
        channelId: cid,
        channelName: ch.name,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMs: totalMs,
        totalMembers: membersSummary.length,
        members: membersSummary
      };
      vcLogsArchive.push(summaryObj);
      await saveSessionToGoogleSheets(summaryObj);

      // admin detailed embed
      const adminLines = membersSummary.map((m, i) => `**${i+1}. ${m.tag}** — ${msToHMS(m.ms)} — joins: ${1 + (m.rejoinCount || 0)} (rejoins: ${m.rejoinCount || 0})`);
      const firstJoin = membersSummary.slice().sort((a,b) => a.firstJoinTs - b.firstJoinTs)[0] || null;
      const longest = membersSummary.slice().sort((a,b) => b.ms - a.ms)[0] || null;

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
          '**Participants:**'
        ].filter(Boolean).join('\n'))
        .setColor(0x2b2d31)
        .setTimestamp();
      if (adminLines.length) {
        adminEmbed.addFields({ name: `Member breakdown (${adminLines.length})`, value: adminLines.join('\n').slice(0, 1024) });
      }
      await sendVCAdminLog(guild, adminEmbed);

      // public embed
      const publicTop = membersSummary.sort((a,b)=>b.ms-a.ms).slice(0,5);
      const publicLines = publicTop.map((m,i) => {
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'•';
        return `${medal} ${m.tag} — ${msToHMS(m.ms)}${m.rejoinCount ? ` (rejoins: ${m.rejoinCount})` : ''}`;
      });
      const publicEmbed = new EmbedBuilder()
        .setTitle(`🎙️ VC Session Summary — ${ch.name}`)
        .setDescription([
          `**Total participants:** ${membersSummary.length}`,
          `**Total voice time (sum):** ${msToHMS(totalMs)}`,
          longest ? `**Longest listener:** ${longest.tag} — ${msToHMS(longest.ms)}` : '',
          '',
          '**Top listeners this session:**',
          publicLines.join('\n') || '_No data_'
        ].filter(Boolean).join('\n'))
        .setColor(0x5865f2)
        .setTimestamp();
      await sendVCPublicLog(guild, publicEmbed);

      // clear session
      delete vcActiveSessions[gid][cid];
      if (vcActiveSessions[gid] && Object.keys(vcActiveSessions[gid]).length === 0) delete vcActiveSessions[gid];
    } else {
      // just persisted state for the user
      vcActiveSessions[gid][cid] = session;
    }
  } catch (e) { console.error('[VC] leave error', e); }
}

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
    if (joined) handleVCJoin(guild, newChannel, user);
    else if (left) handleVCLeave(oldChannel, null, user, guild);
    else if (moved) { handleVCLeave(oldChannel, newChannel, user, guild); handleVCJoin(guild, newChannel, user); }
  } catch (e) { console.error('[VC] voiceStateUpdate handler error', e); }
});

// ------------------- Slash commands & interactions -------------------
// We assume your slash commands are deployed externally (deploy-commands.js) with same names used below.

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, guild } = interaction;
    if (!guild) return interaction.reply({ content: 'This command must be used in a server.' });

    // /addkeyword
    if (cmd === 'addkeyword') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const word = interaction.options.getString('word').toLowerCase();
      const gset = getGuildKeywords('global');
      if (gset.has(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` already exists.` });
      gset.add(word);
      await logKeywordChangeToSheet('ADD', word, interaction.user).catch(()=>{});
      return interaction.reply({ content: `✅ Added keyword: \`${word}\`` });
    }

    // /removekeyword
    if (cmd === 'removekeyword') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const word = interaction.options.getString('word').toLowerCase();
      const gset = getGuildKeywords('global');
      if (!gset.has(word)) return interaction.reply({ content: `⚠️ Keyword \`${word}\` not found.` });
      gset.delete(word);
      await logKeywordChangeToSheet('REMOVE', word, interaction.user).catch(()=>{});
      return interaction.reply({ content: `✅ Removed keyword: \`${word}\`` });
    }

    // /regions
    if (cmd === 'regions') { return interaction.reply({ embeds: [buildRegionEmbed(guild)] }); }

    // /bb (help)
    if (cmd === 'bb') {
      const embed = new EmbedBuilder().setTitle('🤖 BusyPang — Help & Commands').setColor(0x00b3ff)
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

    // /warnings
    if (cmd === 'warnings') {
      const target = interaction.options.getUser('member') || interaction.user;
      const warnMap = getGuildWarnings(guild.id);
      const count = warnMap.get(target.id) || 0;
      return interaction.reply({ content: `🧾 **${target.tag}** has **${count}/3** warnings.` });
    }

    // /warn (admin)
    if (cmd === 'warn') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Warned by ${interaction.user.tag}`;
      const warnMap = getGuildWarnings(guild.id);
      const current = warnMap.get(user.id) || 0;
      const next = Math.min(3, current + 1);
      warnMap.set(user.id, next);
      // log to sheet
      logWarnEventToSheet(guild, user, interaction.user, reason, next).catch(()=>{});
      // DM user
      try {
        const dm = new EmbedBuilder().setTitle('⚠️ You have received a warning').setDescription(`You received a warning in **${guild.name}**.`)
          .addFields({ name: 'Moderator', value: interaction.user.tag, inline: true }, { name: 'Reason', value: reason, inline: false }, { name: 'Warning Count', value: `${next}/3`, inline: true })
          .setTimestamp();
        if (RULES_LINK) dm.addFields({ name: '📜 Rules', value: `[Click to view rules](${RULES_LINK})`, inline: false });
        await user.send({ embeds: [dm] }).catch(()=>{});
      } catch {}
      await interaction.reply({ content: `⚠️ Warned **${user.tag}** — now at **${next}/3** warnings.\n📝 ${reason}` });
      if (next >= 3) {
        bannedUsers.add(user.id);
        try {
          await guild.members.ban(user.id, { reason: `Auto-ban at 3 warnings (last: ${reason})` });
          await logBanEventToSheet(guild, user, interaction.user, `3 warnings — last: ${reason}`, 'AUTO_WARN_3');
          try {
            const banDM = new EmbedBuilder().setTitle('🚫 You have been banned').setDescription(`You were **banned** from **${guild.name}** due to 3 warnings.`)
              .addFields({ name: 'Moderator', value: interaction.user.tag, inline: true }, { name: 'Reason', value: `3 warnings — last: ${reason}`, inline: false }, { name: 'Type', value: 'Lifetime Ban', inline: true }).setTimestamp();
            if (RULES_LINK) banDM.addFields({ name: '📜 Rules', value: `[Server Rules](${RULES_LINK})`, inline: false });
            await user.send({ embeds: [banDM] }).catch(()=>{});
          } catch {}
          await interaction.followUp({ content: `🚫 **${user.tag}** reached 3/3 warnings and was banned.` });
        } catch (e) {
          console.error('Auto-ban error', e);
          await interaction.followUp({ content: `⚠️ Warning reached 3/3 but I could NOT ban **${user.tag}**. Check bot role permissions.` });
        }
      }
      return;
    }

    // /clearwarns
    if (cmd === 'clearwarns') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const user = interaction.options.getUser('member');
      getGuildWarnings(guild.id).set(user.id, 0);
      await interaction.reply({ content: `🧹 Cleared warnings for **${user.tag}**.` });
      return;
    }

    // /ban (manual)
    if (cmd === 'ban') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || `Manual ban by ${interaction.user.tag}`;
      bannedUsers.add(user.id);
      try {
        await guild.members.ban(user.id, { reason });
        // DM
        try {
          const banDM = new EmbedBuilder().setTitle('🚫 You have been banned').setDescription(`You have been **banned** from **${guild.name}**.`)
            .addFields({ name: 'Moderator', value: `${interaction.user.tag}`, inline: true }, { name: 'Reason', value: reason, inline: false }, { name: 'Type', value: 'Lifetime ban', inline: true }).setTimestamp();
          if (RULES_LINK) banDM.addFields({ name: '📜 Rules', value: `[View rules](${RULES_LINK})`, inline: false });
          await user.send({ embeds: [banDM] }).catch(()=>{});
        } catch {}
        await interaction.reply({ content: `🚫 Banned **${user.tag}**. 📝 ${reason}` });
        await appendBanToSheet(guild, user, interaction.user, reason, 'MANUAL');
      } catch (e) {
        console.error('ban error', e);
        await interaction.reply({ content: '⚠️ Could not ban that user — check my role position & permissions.' });
      }
      return;
    }

    // /pardon (unban by id)
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
      } catch (e) {
        console.error('pardon error', e);
        await interaction.reply({ content: '⚠️ Could not unban that user (maybe not banned?).' });
      }
      return;
    }

    // /banlist
    if (cmd === 'banlist') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const bans = await guild.bans.fetch().catch(()=>new Map());
      const lines = [];
      for (const [id, b] of bans) lines.push(`• **${b.user.tag}** (<@${id}>)`);
      const text = lines.join('\n') || '_No bans._';
      return interaction.reply({ content: `📕 Lifetime Ban List\n\n${text.slice(0,1900)}` });
    }

    // /warnlist
    if (cmd === 'warnlist') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.' });
      const warnMap = getGuildWarnings(guild.id);
      const entries = [...warnMap.entries()].filter(([,c]) => c > 0);
      const lines = [];
      for (const [id, count] of entries) {
        let tag = id;
        try { const u = await client.users.fetch(id); tag = u.tag; } catch {}
        lines.push(`• **${tag}** — ${count}/3 (<@${id}>)`);
      }
      const text = lines.join('\n') || '_No warnings._';
      return interaction.reply({ content: `🧾 Warning List\n\n${text.slice(0,1900)}` });
    }

    // VC commands: /mystats, /vcleaderboard, /weekly, /session, /monthly
    if (cmd === 'mystats') {
      const user = interaction.user;
      const gid = guild.id;
      const agg = (vcAggregates[gid] && vcAggregates[gid][user.id]) || { lifetimeMs: 0, weekly: {}, monthly: {} };
      const wkKey = getYearWeek(new Date());
      const moKey = getYearMonth(new Date());
      const embed = new EmbedBuilder()
        .setTitle(`📊 VC Stats — ${user.tag}`)
        .addFields({ name: 'Lifetime', value: msToHMS(agg.lifetimeMs || 0), inline: true }, { name: `This week (${wkKey})`, value: msToHMS((agg.weekly && agg.weekly[wkKey]) || 0), inline: true }, { name: `This month (${moKey})`, value: msToHMS((agg.monthly && agg.monthly[moKey]) || 0), inline: true })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'vcleaderboard') {
      const gid = guild.id;
      const wkKey = getYearWeek(new Date());
      const moKey = getYearMonth(new Date());
      const aggGuild = vcAggregates[gid] || {};
      const arr = Object.entries(aggGuild).map(([uid, data]) => ({ uid, lifetime: data.lifetimeMs || 0, weekly: (data.weekly && data.weekly[wkKey]) || 0, monthly: (data.monthly && data.monthly[moKey]) || 0 }));
      const topWeekly = arr.slice().sort((a,b)=>b.weekly-a.weekly).slice(0,10);
      const topMonthly = arr.slice().sort((a,b)=>b.monthly-a.monthly).slice(0,10);
      const wkLines = await Promise.all(topWeekly.map(async (it,i)=>{ let tag=`<@${it.uid}>`; try{ const u=await client.users.fetch(it.uid); if(u&&u.tag) tag=u.tag; }catch{} return `**${i+1}.** ${tag} — ${msToHMS(it.weekly)}`; }));
      const moLines = await Promise.all(topMonthly.map(async (it,i)=>{ let tag=`<@${it.uid}>`; try{ const u=await client.users.fetch(it.uid); if(u&&u.tag) tag=u.tag; }catch{} return `**${i+1}.** ${tag} — ${msToHMS(it.monthly)}`; }));
      const embed = new EmbedBuilder().setTitle('🏆 Voice Leaderboards').setDescription(`Top members — Weekly (${wkKey}) & Monthly (${moKey})`).addFields({ name: `Weekly — Top ${wkLines.length}`, value: wkLines.join('\n') || '_No data_', inline: true }, { name: `Monthly — Top ${moLines.length}`, value: moLines.join('\n') || '_No data_', inline: true }).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'weekly') {
      const target = interaction.options.getUser('member') || interaction.user;
      const gid = guild.id;
      const agg = (vcAggregates[gid] && vcAggregates[gid][target.id]) || { lifetimeMs: 0, weekly: {}, monthly: {} };
      const keys = Object.keys(agg.weekly || {}).sort().slice(-6).reverse();
      const lines = keys.map(k => `${k} — ${msToHMS(agg.weekly[k])}`);
      const embed = new EmbedBuilder().setTitle(`📈 Weekly VC Breakdown — ${target.tag}`).setDescription(lines.join('\n') || '_No weekly data_').setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'session') {
      const user = interaction.user;
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
      const embed = new EmbedBuilder().setTitle(`🔔 Live VC Tracking — ${ch.name}`).setDescription(parts.join('\n') || '_No participants tracked_').setFooter({ text: `Session started: ${formatMYTTime(new Date(session.startTs))}` }).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'monthly') {
      const gid = guild.id;
      const key = prevMonthKey(new Date());
      const guildSummaries = vcMonthlySummaries[gid] || {};
      if (!guildSummaries[key]) {
        return interaction.reply({ content: '❌ Sorry, this month’s summary is not ready yet. Please check again at the end of the month.' });
      }
      const summary = guildSummaries[key];
      // create embed file
      const embed = new EmbedBuilder().setTitle(`📅 Monthly VC Summary — ${guild.name} — ${summary.key}`).setDescription([`**Period:** ${formatMYTTime(new Date(summary.start))} — ${formatMYTTime(new Date(summary.end))}`, `**Generated:** ${formatMYTTime(new Date(summary.generatedAt))}`, `**Total sessions:** ${summary.totalSessions}`, `**Total voice time (sum):** ${msToHMS(summary.totalMs)}`, '', '**Member breakdown:**'].join('\n')).setColor(0x1abc9c).setTimestamp();
      const lines = summary.members.map(m => `${m.uid ? `<@${m.uid}>` : m.tag} — ${msToHMS(m.ms)} (${m.sessions} sessions, ${m.rejoinCount || 0} rejoins)`);
      const fullText = lines.join('\n');
      embed.addFields({ name: 'Top members', value: fullText.slice(0, 1000) || '_No data_' });
      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('interaction handler error', err);
    if (!interaction.replied) interaction.reply({ content: '❌ Unexpected error. Try again later.' }).catch(()=>{});
  }
});

// Monthly summary builder (generate from vcLogsArchive)
function buildMonthlySummaryForKey(guildId, key) {
  const { start, end } = monthRangeForKey(key);
  const sessions = (vcLogsArchive || []).filter(s => s.guildId === guildId && new Date(s.end) >= start && new Date(s.end) <= end);
  const perUser = {};
  let totalMs = 0;
  for (const s of sessions) {
    for (const m of s.members || []) {
      if (!perUser[m.uid]) perUser[m.uid] = { ms: 0, sessions: 0, rejoinCount: 0 };
      perUser[m.uid].ms += (m.ms || 0);
      perUser[m.uid].sessions += 1;
      perUser[m.uid].rejoinCount += (m.rejoinCount || 0);
      totalMs += (m.ms || 0);
    }
  }
  const members = Object.entries(perUser).map(([uid,v]) => ({ uid, ms: v.ms, sessions: v.sessions, rejoinCount: v.rejoinCount })).sort((a,b)=>b.ms-a.ms);
  return { key, guildId, start: start.toISOString(), end: end.toISOString(), generatedAt: new Date().toISOString(), totalSessions: sessions.length, totalMs, members };
}

async function postAndSaveMonthlySummary(guild, summary) {
  try {
    if (!vcMonthlySummaries[guild.id]) vcMonthlySummaries[guild.id] = {};
    vcMonthlySummaries[guild.id][summary.key] = summary;

    // Add Dashboard entry
    const dashboardRow = [
      `Monthly ${summary.key}`,
      `Guild ${guild.id}`,
      `${summary.totalSessions} sessions`,
      msToHMS(summary.totalMs),
      toMalaysiaTimeIso(new Date(summary.generatedAt))
    ];

    await ensureSheetExists(
      'Dashboard',
      ['Metric', 'Guild', 'Sessions', 'TotalTime', 'Generated At'],
      'VC Dashboard (auto-generated)'
    );

    await appendAndSort('Dashboard', [dashboardRow], 4);

    // Post embed to channels
    try {
      const embed = new EmbedBuilder()
        .setTitle(`📅 Monthly VC Summary — ${guild.name} — ${summary.key}`)
        .setDescription([
          `**Period:** ${formatMYTTime(new Date(summary.start))} — ${formatMYTTime(new Date(summary.end))}`,
          `**Generated:** ${formatMYTTime(new Date(summary.generatedAt))}`,
          `**Total sessions:** ${summary.totalSessions}`,
          `**Total voice time (sum):** ${msToHMS(summary.totalMs)}`,
          '',
          '**Member breakdown:**'
        ].join('\n'))
        .setColor(0x1abc9c)
        .setTimestamp();

      const adminCh = guild.channels.cache.get(VC_LOG_CHANNEL_ID) || guild.channels.cache.get(LOG_CHANNEL);
      if (adminCh) await adminCh.send({ embeds: [embed] }).catch(() => {});

      const statsCh = guild.channels.cache.get(VC_STATS_CHANNEL_ID) || guild.channels.cache.get(STATS_CHANNEL);
      if (statsCh) await statsCh.send({ embeds: [embed] }).catch(() => {});
      
    } catch (e) {
      console.error('[VC][Monthly] embed posting error', e);
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
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const [y,m,d] = fmt.format(now).split('-').map(Number);
    if (d !== 1) return;
    for (const [, guild] of client.guilds.cache) {
      try {
        const key = prevMonthKey(now);
        if (vcMonthlySummaries[guild.id] && vcMonthlySummaries[guild.id][key]) continue;
        const summary = buildMonthlySummaryForKey(guild.id, key);
        await postAndSaveMonthlySummary(guild, summary);
        console.log(`[VC][Monthly] Generated summary ${key} for guild ${guild.name}`);
      } catch (e) { console.error('[VC][Monthly] per-guild error', e); }
    }
  } catch (e) { console.error('[VC][Monthly] runDailyCheck error', e); }
}

// run once now, then schedule
runDailyCheck();
setInterval(runDailyCheck, 24 * 60 * 60 * 1000);

// ------- ready handler -------
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  // load sheets into memory (if available)
  await loadAllFromSheets();
  // Sync bans from Discord to memory and sheets
  for (const [, guild] of client.guilds.cache) {
    try {
      const bans = await guild.bans.fetch().catch(()=>new Map());
      for (const [id] of bans) bannedUsers.add(id);
      // sync missing bans to sheet
      if (bans.size) {
        // use getExistingBanIdsFromSheet? We'll just append missing ones.
        // Read existing sheet IDs
        const existingRows = await readRange('BanList','A2:G5000');
        const existingSet = new Set(existingRows.map(r=>r[2]));
        const rowsToAdd = [];
        for (const [, ban] of bans) {
          const user = ban.user; if (!user) continue;
          if (!existingSet.has(user.id)) {
            rowsToAdd.push([toMalaysiaTimeIso(new Date()), guild.id, user.id, user.tag, 'SYSTEM (startup sync)', ban.reason || 'No reason', 'Startup Sync']);
            bannedUsers.add(user.id);
          }
        }
        if (rowsToAdd.length) {
          for (const r of rowsToAdd) await appendAndSort('BanList', [r], 0);
          console.log(`[Sheets] Synced ${rowsToAdd.length} startup bans to BanList`);
        }
      }
    } catch (e) { console.warn('Failed to sync bans for', guild?.name, e?.message || e); }
  }

  // presence rotation
  setRandomPresence();
  setInterval(setRandomPresence, 10 * 60 * 1000);

  // update region stats
  for (const [, guild] of client.guilds.cache) { await updateRegionStats(guild).catch(()=>{}); }

  // periodic region leaderboard update
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) { await updateRegionStats(guild).catch(()=>{}); }
  }, 5 * 60 * 1000);

  console.log("🚀 BusyPang fully started (Sheets-backed).");
});

// safety
client.on('error', console.error);
client.on('shardError', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// express keepalive
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🟢 BusyPang (Sheets) is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// login
client.login(TOKEN).catch(err => { console.error('Failed to login:', err); process.exit(1); });

// ------------------- End of file -------------------