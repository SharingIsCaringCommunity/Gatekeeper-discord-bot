# 📜 Gatekeeper Bot — Changelog

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.5.8-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>

---

## v1.5.8 (2025-09-24)  
**Permissions Refinement**

### ✅ What’s new
- `/warnings` is now **split by role**:
  - Normal members → can only check **their own warnings**.  
  - Admins → can check warnings for **any member**.  
- `/banlist` and `/warnlist` remain **Admin-only**.  
- Public replies for all errors (no more hidden “Only you can see this”).  

---

## v1.5.7 (2025-09-24)  
**Warnings List (Paginated Embeds)**  

- Added `/warnlist` (Admin-only).  
- Paginated embeds with Prev / Next / Refresh / Close buttons.  
- Sorted by highest warnings first.  
- Mentions clickable (`<@id>`) but don’t ping.  

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
- Error messages are now public replies.  

---

## v1.5.3 (2025-09-23)  
**Slash Command Fixes**  

- Fixed duplicate slash command registration.  
- Enforced per-guild registration for instant visibility.  

---

## v1.5.2 (2025-09-23)  
**Stability & Quality Polishing**  

- Improved ban sync reliability.  
- Clearer feedback in `/banlist`, `/warnings`, `/pardon`.  
- Logs now use `<@user>` mentions.  

---

## v1.5.1 (2025-09-23)  
**Ban Sync & Guild Support**  

- Synced ban list with server on startup.  
- Live updates with `guildBanAdd` / `guildBanRemove`.  
- Slash commands auto-registered on new servers.  

---

## v1.5.0 (2025-09-23)  
**Slash Command Migration + Ban Sync**  

- Migrated all `!prefix` commands to slash commands.  
- Added: `/bb`, `/warn`, `/warnings`, `/clearwarns`, `/ban`, `/pardon`, `/banlist`.  
- Per-guild registration with `GUILD_ID`.  
- Better error messages for role hierarchy.  

---

## Older Versions
- **v1.4.0–1.4.3** → Warning system, clearwarns, admin checks.  
- **v1.3.x** → ENV vars, help → bb, startup sync.  
- **v1.2** → Manual commands (`!ban`, `!pardon`, etc).  
- **v1.1** → Improved auto-ban, join/leave logs.  
- **v1.0** → Initial release (auto-ban leavers, rejoiners).  
