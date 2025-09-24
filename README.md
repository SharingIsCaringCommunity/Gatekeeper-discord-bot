# 📜 Gatekeeper Bot — Changelog

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.6.1-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>

---

## [v1.6.1] - 2025-09-24
### 🐞 Bug Fixes
- Fixed issue where `/pardon` did not properly reply after unbanning a user.  
- Corrected log and reply messages for `/pardon` to ensure consistent feedback.  
- Fixed **pardon/unban** to also work with **user IDs** (needed for lifetime bans where the user is not in the server).  

### 🔧 Improvements
- Ensured lifetime ban cache (`bannedUsers`) and warning resets are applied correctly during a pardon.  
- Cleaner console and log messages when pardon/unban fails due to missing permissions.  
- More reliable handling of pardons for users not currently in the server.  

---

## [v1.6.0] - 2025-09-24
### ✨ Features
- Added **DM embeds** for warned and auto-banned users:
  - Includes reason, current warning count, and optional server rules link (`RULES_LINK` env var).
  - Auto-ban at 3 warnings sends a ban DM with moderator info.
- Added emoji reactions across all commands for better UX.
- Added **paginated embeds** for `/banlist` and `/warnlist` with:
  - ◀ Prev / ▶ Next / 🔄 Refresh / ✖ Close controls
  - Auto-disables after 2 minutes of inactivity

### 🔄 Improvements
- Lifetime ban list and warning list now display user **mentions (`<@id>`)** for quick profile access.
- Logs improved with consistent emoji markers.
- Commands now show **public replies** (not ephemeral).

---

## [v1.5.8] - 2025-09-24
### 🐞 Bug Fixes
- Fixed `/warnlist` sorting and mention display.
- Fixed slash command registration edge cases.

---

## [v1.5.7] - 2025-09-24
### 🔧 Improvements
- Added better sorting for `/banlist`.
- Improved handling of unknown users in both ban and warning lists.

---

## [v1.5.6] - 2025-09-24
### ✨ Features
- Added `/warnlist` command for admins to view all warnings in the server.

---

## [v1.5.5] - 2025-09-24
### 🔧 Improvements
- Pagination system added for `/banlist`.

---

## [v1.5.4] - 2025-09-23
### ✨ Features
- Everyone can see commands, but **execution restricted to Admins** for moderation commands.

---

## [v1.5.3] - 2025-09-23
### 🔧 Improvements
- Public replies (not ephemeral).
- Error messages visible to all (no private replies).

---

## [v1.5.2] - 2025-09-23
### Stability & Quality Polishing
- Improved ban sync reliability on startup and re-invite.
- `/banlist`, `/warnings`, `/pardon` now provide clearer feedback if user not found or not banned.
- Logs improved to use `<@user>` mentions instead of plain tags.
- Fixed slash commands not appearing reliably after deploy.

---

## [v1.5.0] - 2025-09-23
### Slash Command Migration + Ban Sync
- Migrated all commands from `!prefix` to Discord slash commands:
  - `/bb` → Help & command list
  - `/warn @user [reason]` → Warn member (3 warnings = auto-ban)
  - `/warnings [@user]` → Check warnings
  - `/clearwarns @user [reason]` → Reset warnings
  - `/ban @user [reason]` → Manual ban
  - `/pardon @user [reason]` → Pardon/unban
  - `/banlist` → Show lifetime ban list
- Slash commands are now registered per-guild (`GUILD_ID` required).
- **Ban Sync**: Bot automatically syncs with existing bans at startup.
- **Real-time Updates**: Tracks `guildBanAdd` / `guildBanRemove`.
- **Error Feedback**: Clearer messages for missing permissions.

---

## [v1.0] - Initial Release
- Auto-ban leavers and rejoiners.
- Join/leave logging.
- Keep-alive server.
