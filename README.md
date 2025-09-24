# 📜 Gatekeeper Bot — Changelog

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.5.6-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>

---

## v1.5.6 (2025-09-24)  
**Mention Logic Update**

### ✅ What’s new
- `/warn`, `/warnings`, and `/pardon` now **ping the user** with `<@userId>` so members receive a notification.  
- `/ban` and `/banlist` use **username + ID only** (no ping), avoiding unnecessary notifications for banned users.  

### 🔄 Improvements
- Logs are now clearer and more consistent with mentions vs tags.  
- Admin actions are still fully visible to everyone in the log channel.  

---

## v1.5.5 (2025-09-24)  
**Public Replies (No More Ephemeral Responses)**  

- Removed all `ephemeral: true` flags.  
- All command replies (success, errors, help, logs) are now **posted in the channel for everyone to see**.  
- Permission errors, user feedback, and command outputs are no longer private.  

---

## v1.5.4 (2025-09-24)  
**Command Visibility Update**  

- All slash commands are now visible to everyone in the guild.  
- Admin-only commands (`/ban`, `/warn`, `/pardon`, `/clearwarns`) enforce permissions **at runtime** instead of being hidden.  
- Regular members can still run `/warnings`, `/banlist`, and `/bb`.  

---

## v1.5.3 (2025-09-23)  
**Slash Command Fixes**  

- Fixed duplicate registration of slash commands.  
- Updated deployment logic to properly sync with Discord API.  
- Commands now consistently appear in Discord UI after deployment.  

---

## v1.5.2 (2025-09-23)  
**Stability & Quality Polishing**  

- Improved ban sync reliability on startup and re-invite.  
- `/banlist`, `/warnings`, `/pardon` now provide clearer feedback if user not found or not banned.  
- Logs improved to use `<@user>` mentions instead of plain tags.  
- Fixed slash commands not appearing reliably after deploy by enforcing per-guild registration.  
- Clearer error messages when bot lacks permissions.  

---

## v1.5.1 (2025-09-23)  
**Ban Sync & Guild Support**  

- Added ban sync on startup — lifetime ban list always matches the server’s bans.  
- Listens to `guildBanAdd` and `guildBanRemove` to keep ban cache updated.  
- Added `guildCreate` handler → registers slash commands & syncs bans when bot joins a new server.  

---

## v1.5.0 (2025-09-23)  
**Slash Command Migration + Ban Sync**  

- Migrated all commands from `!prefix` to Discord slash commands:  
  - `/bb` → Help & command list  
  - `/warn @user [reason]` → Warn member (3 warnings = auto-ban)  
  - `/warnings [@user]` → Check warnings  
  - `/clearwarns @user [reason]` → Reset warnings  
  - `/ban @user [reason]` → Manual ban  
  - `/pardon @user [reason]` → Pardon/unban  
  - `/banlist` → Show all lifetime-banned members  
- Slash commands are now registered per-guild (`GUILD_ID` required).  
- Commands autocomplete in chat, no need to remember `!` prefix.  
- Bot automatically syncs with existing bans at startup and listens to ban events for real-time updates.  

---
