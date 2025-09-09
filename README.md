# 📜 Gatekeeper Bot — Changelog

## v1.3.2 (2025-09-10)
**Command Update**

### ✅ What’s new
- Replaced the old help command:
  - ❌ `!help`
  - ✅ `!gkbot`
- `!gkbot` now shows the list of all Gatekeeper Bot commands with usage examples.
- Keeps consistency with the bot name and avoids conflicts with other bots that use `!help`.

---

## v1.3.1 (2025-09-10)
**Environment Variables Update (Railway-ready)**

- Removed hardcoded token and channel ID.
- Introduced environment variables:
  - `DISCORD_TOKEN` → your bot token.
  - `LOG_CHANNEL` → log channel ID.
- Fully compatible with Railway deployments.

---

## v1.3 (2025-09-01)
**Stability & Quality Update**

- Synced lifetime ban list with server bans on startup.
- Improved leave-ban reliability.
- Commands accept mention **or raw ID**.
- `!banlist` shows usernames/IDs, auto-splits long lists.
- Reason logging includes moderator name by default.

---

## v1.2 (2025-08-27)
**Command & Logging Update**
- Added `!ban`, `!pardon`, `!banlist`, `!help`.
- Reason logging everywhere (default reasons include moderator names).

---

## v1.1
- Improved auto-ban on rejoin.
- Added join/leave logging.
- Better error handling.

---

## v1.0 (Initial Release)
- Auto-ban on leave/rejoin.
- Basic join/leave logging.
- Express keep-alive server for uptime.
