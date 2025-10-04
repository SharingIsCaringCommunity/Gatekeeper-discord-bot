# 📜 Gatekeeper / BusyPang Bot — Changelog

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.6.3-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>

---

## [v1.6.3] — 2025-10-04  
### 🆕 Features  
- Leaderboard footer now shows **Malaysia Time (MYT)** instead of server UTC.  
- Time format switched to **12-hour (AM/PM)** for better readability.  

### 🔧 Fixes  
- Removed duplicate UTC timestamp caused by `.setTimestamp()`.  
- Footer now consistently displays only MYT, e.g.: Last updated (MYT): 10/04/2025, 06:55:42 AM

---

## [v1.6.2] — 2025-10-03  
### 🆕 Features  
- Added **Malaysia Region Leaderboard** auto-updates in channel.  
- Implemented **incremental updates** (listens to role changes, joins/leaves).  
- `/regions` command shows live leaderboard from cache (no full fetch needed).  

### 🔧 Fixes  
- Reduced heavy `guild.members.fetch()` calls (only once at startup).  
- Leaderboard ranks now sort correctly by member count with medals 🏆🥈🥉.  

---

## [v1.6.1] — 2025-10-02  
### 🆕 Features  
- Added **automatic refresh** every 5 minutes for leaderboard message.  
- Leaderboard embed now shows **"Last updated"** footer with timestamp.  
- Improved warning system (ban after 3rd warning, logs + DM notifications).  
- Added `/pardon` command to unban by **User ID**.  

### 🔧 Fixes  
- Fixed bug where pardoned users were not fully removed from warn/ban cache.  
- Fixed banlist/warnlist pagination issues (now supports multiple pages).  

--- 

## v1.6.0 (2025-09-24)  
**Warnings + Ban System Upgrade**

- Added **rich DM embeds** for warnings:
  - Includes warning count, reason, and optional rules link (`RULES_LINK` env var).
  - Clearer formatting with emojis and sections.
- Auto-ban at 3 warnings:
  - Users now receive a **ban DM embed** showing reason and moderator.
  - Logs updated with clearer lifetime ban notes.
- Pagination for `/banlist` and `/warnlist`:
  - Added `◀ Prev`, `Next ▶`, `🔄 Refresh`, and `✖ Close` buttons.
  - Supports long lists of banned/warned users with page navigation.

---

## v1.5.2 (2025-09-23)  
**Stability & Quality Polishing**

- Improved ban sync reliability on startup and re-invite.  
- `/banlist`, `/warnings`, `/pardon` now provide clearer feedback if user not found or not banned.  
- Logs improved to use `<@user>` mentions instead of plain tags.  
- Fixed slash commands not appearing reliably after deploy by enforcing per-guild registration with `GUILD_ID`.  
- Improved error handling when trying to ban users with higher roles.  

---

## v1.5.1 (2025-09-23)  
**Ban Sync & Guild Support**

- Added ban sync on startup — lifetime ban list always matches the server’s bans.  
- Listens to `guildBanAdd` and `guildBanRemove` to keep ban cache updated.  
- Added `guildCreate` handler → registers slash commands & syncs bans when bot joins a new server.  

---

## v1.5.0 (2025-09-23)  
**Slash Command Migration + Ban Sync**

### ✅ What’s new
- Migrated all commands from `!prefix` to **Discord slash commands**:
  - `/bb` → Help & command list  
  - `/warn @user [reason]` → Warn member (3 warnings = auto-ban)  
  - `/warnings [@user]` → Check warnings  
  - `/clearwarns @user [reason]` → Reset warnings  
  - `/ban @user [reason]` → Manual ban  
  - `/pardon @user [reason]` → Pardon/unban  
  - `/banlist` → Show all lifetime-banned members  
  - `/warnlist` → Show all warned members  
- Slash commands registered per-guild (`GUILD_ID` required).  
- Better UX: autocomplete in chat, no `!` prefix needed.  

### 🔄 Improvements
- Ban Sync: Bot auto-syncs with server bans on startup.  
- Real-time Updates: Listens to ban/unban events to keep cache fresh.  
- Error Feedback: Clearer messages when bot lacks permissions or role too low.  

---

## v1.4.3 (2025-09-23)  
**Warning System Improvements**
- Added `!clearwarns` to `!gkbot` help.  
- Members can check their own warnings; admins can check & clear others.  
- Clearer logs for warnings.  

---

## v1.4.2 (2025-09-23)  
**Clear Warnings Command**
- Added `!clearwarns` (Admins only).  
- Resets warnings to 0/3 with optional reason.  
- Logs all actions.  
- Help updated.  

---

## v1.4.1 (2025-09-23)  
**Admin Role Enforcement + Better Errors**
- Restricted moderation commands to Admins only.  
- Regular members can still use `!warnings` & `!gkbot`.  
- Clearer role hierarchy error message.  

---

## v1.4.0 (2025-09-23)  
**Warning System Update**
- Added `!warn` & `!warnings`.  
- Auto-ban at 3 warnings.  
- Added `!bannedlist` alias.  
- Warnings reset when pardoned.  

---

## v1.3.2 (2025-09-10)  
- Replaced `!help` → `!gkbot`.  

## v1.3.1 (2025-09-10)  
- Moved secrets to ENV vars (`DISCORD_TOKEN`, `LOG_CHANNEL`).  

## v1.3 (2025-09-01)  
- Synced bans on startup.  
- Accepts raw ID or mention.  
- `!banlist` resolves usernames.  

---

## v1.2 (2025-08-27)  
- Added `!ban`, `!pardon`, `!banlist`, `!help`.  
- Full reason logging with defaults.  

---

## v1.1  
- Improved auto-ban on rejoin.  
- Added join/leave logging.  

---

## v1.0 (Initial Release)  
- Auto-ban leavers & rejoiners.  
- Basic join/leave logging.  
- Keep-alive Express server.  
