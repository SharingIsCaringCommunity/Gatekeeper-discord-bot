# 📜 Gatekeeper Bot — Changelog

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.5.7-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>

---

## v1.5.7 (2025-09-24)  
**Warnings List (Paginated Embeds)**  

### ✅ What’s new
- Added `/warningslist` (Admin-only):  
  - Shows all members with warnings.  
  - Paginated embeds with Prev / Next / Refresh / Close buttons.  
  - Sorted by highest warnings first.  
  - Mentions are clickable (`<@id>`) but don’t ping.  

### 🔄 Improvements
- Unified pagination UX with `/banlist`.  
- Both banlist & warningslist auto-timeout after 2 minutes.  
- Refresh buttons pull latest data (live sync).  

---

## v1.5.6 (2025-09-23)  
**Banlist Pagination & Buttons**  

- Upgraded `/banlist` into paginated embeds.  
- Added Prev / Next / Refresh / Close controls.  
- Mentions clickable without ping.  
- Auto-timeout after 2 minutes.  

---

## v1.5.5 (2025-09-23)  
**Better Mentions & Sync**  

- `/banlist` now uses `<@id>` for clickable profiles.  
- Fallback `(unknown)` if user cache missing.  
- No more `@unknown-user` spam.  

---

## v1.5.4 (2025-09-23)  
**Permissions & Replies**  

- Everyone can see commands, but only Admins can run moderation ones.  
- Error messages (`no permission`, `user not found`, `could not ban`) are now public replies.  

---

## v1.5.3 (2025-09-23)  
**Slash Command Fixes**  

- Fixed duplicate slash command registration.  
- Enforced per-guild registration to ensure commands appear instantly.  

---

## v1.5.2 (2025-09-23)  
**Stability & Quality Polishing**  

- Improved ban sync reliability on startup and re-invite.  
- `/banlist`, `/warnings`, `/pardon` → clearer feedback.  
- Logs now use `<@user>` mentions.  
- Fixed role hierarchy errors with clearer feedback.  

---

## v1.5.1 (2025-09-23)  
**Ban Sync & Guild Support**  

- Synced ban list with server on startup.  
- Listens to `guildBanAdd` / `guildBanRemove`.  
- Registers slash commands when bot joins new servers.  

---

## v1.5.0 (2025-09-23)  
**Slash Command Migration + Ban Sync**  

- Migrated all `!prefix` commands → slash commands.  
- Commands: `/bb`, `/warn`, `/warnings`, `/clearwarns`, `/ban`, `/pardon`, `/banlist`.  
- Slash commands registered per-guild.  
- Autocomplete in chat.  
- Ban sync & error feedback improvements.  

---

## Older Versions
- **v1.4.0–1.4.3** → Warning system, clearwarns, admin checks.  
- **v1.3.x** → ENV vars, help → bb, startup sync.  
- **v1.2** → Manual commands added (`!ban`, `!pardon`, etc).  
- **v1.1** → Improved auto-ban, join/leave logs.  
- **v1.0** → Initial release (auto-ban leavers, rejoiners).  
