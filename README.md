# 📜 Gatekeeper Bot — Changelog

## v1.3.1 (2025-09-10)
**Environment Variables Update (Railway-ready)**

### ✅ What’s new
- Removed hardcoded token and channel ID from `index.js`.
- Introduced environment variables:
  - `DISCORD_TOKEN` → your bot token.
  - `LOG_CHANNEL` → channel ID for logging.
- Compatible with Railway (or any platform with ENV Vars).
- Safer for production deployments (no token leaks in code).

---

## v1.3 (2025-09-01)
**Stability & quality update for lifetime-ban workflow.**

- Synced lifetime ban list with all server bans on startup.
- Improved leave-ban reliability with `guild.members.ban(id)` (works even after user leaves).
- Commands accept mention **or raw ID** (`!ban`, `!pardon`).
- `!banlist` shows usernames/IDs, auto-splits if too long.
- Reason logging: default reasons include moderator name.

---

## v1.2 (2025-08-27)
**Command & Logging Update**
- Added `!ban`, `!pardon`, `!banlist`, `!help`.
- Full reason logging for bans/pardons.
- Default reasons:
  - Ban → *Manual ban by `<moderator>`*.
  - Pardon → *Pardon issued by `<moderator>`*.
- Improved moderator confirmations and logs.

---

## v1.1
- Improved auto-ban on rejoin (lifetime ban).
- Added join/leave logging.
- Better error handling for missing permissions.

---

## v1.0 (Initial Release)
- Auto-ban users who leave the server (lifetime ban).
- Auto-ban if banned users try to rejoin.
- Basic logging of joins/leaves.
- Express keep-alive server for 24/7 uptime.
