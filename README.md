# 📜 Gatekeeper Bot — Changelog  

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.5.4-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>  

---

## v1.5.4 (2025-09-24)  
**Command Visibility Update**  

### ✅ What’s new  
- All slash commands (`/ban`, `/warn`, `/clearwarns`, etc.) are now **visible to everyone**.  
- Permission checks updated:  
  - **Admins only** → `/ban`, `/pardon`, `/warn`, `/clearwarns`, `/banlist`.  
  - **Everyone** → `/warnings` (to check their own or others’ warnings) and `/bb` (help).  

### 🔄 Improvements  
- Better user experience: members can see all available commands but will get a clear message if they try to use an admin-only one.  
- Logs now show when permission denial happens for transparency.  

---

## v1.5.3 (2025-09-24)  
**Guild-only Slash Commands + Cleanup**  

### ✅ What’s new  
- Changed `/gkbot` → `/bb` for help & command list.  
- Slash commands now deploy **guild-only** (no global duplication).  
- Auto clear global commands on deploy (safe fallback).  

### 🔄 Improvements  
- Cleaner deployment logs (`deploy-commands.js`).  
- Removed duplicate commands issue.  
- Railway auto-deploy now runs command deploy + bot start smoothly.  

---

## v1.5.2 (2025-09-23)  
**Stability & Quality Polishing**  

### ✅ What’s new  
- Improved ban sync reliability on startup and re-invite.  
- `/banlist`, `/warnings`, `/pardon` now provide clearer feedback if user not found or not banned.  
- Logs improved to use `<@user>` mentions instead of plain tags.  

### 🔄 Fixes  
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
- Migrated all commands from `!prefix` to Discord slash commands:  
  - `/gkbot` → Help & command list  
  - `/warn @user [reason]` → Warn member (3 warnings = auto-ban)  
  - `/warnings [@user]` → Check warnings  
  - `/clearwarns @user [reason]` → Reset warnings  
  - `/ban @user [reason]` → Manual ban  
  - `/pardon @user [reason]` → Pardon/unban  
  - `/banlist` → Show all lifetime-banned members  
- Slash commands are now registered per-guild (`GUILD_ID` required).  
- Better UX: commands autocomplete in chat, no need to remember `!` prefix.  

### 🔄 Improvements  
- **Ban Sync**: Bot now automatically syncs with existing server bans on startup.  
- **Real-time Updates**: Listens to `guildBanAdd` / `guildBanRemove` to keep lifetime ban list fresh.  
- **Error Feedback**: Clearer messages if bot lacks permissions or role is too low.  

---

## v1.4.3 (2025-09-23)  
**Warning System Improvements**  
- Added `!clearwarns` to `!gkbot` help command.  
- Members can check their own warnings; admins can check & clear others.  
- Clearer logs for warning actions.  

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
- Moved to ENV vars (`DISCORD_TOKEN`, `LOG_CHANNEL`).  

## v1.3 (2025-09-01)  
- Synced bans on startup.  
- Accepts raw ID or mention.  
- `!banlist` resolves usernames.  

---

## v1.2 (2025-08-27)  
- Added `!ban`, `!pardon`, `!banlist`, `!help`.  

---

## v1.1  
- Improved auto-ban on rejoin.  
- Join/leave logging.  

---

## v1.0  
- Initial release: auto-ban leavers, rejoiners.  
- Join/leave logging.  
- Keep-alive server.  
