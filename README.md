# 📜 Gatekeeper Bot — Changelog

## v1.4.2 (2025-09-23)
**Clear Warnings Command**

### ✅ What’s new
- Added `!clearwarns` command:
  - Admin-only.
  - Resets a member’s warnings back to 0/3.
  - Accepts optional reason (default: `Warnings cleared by <admin>`).
  - Logs the action in the log channel.
- Updated `!gkbot` help to include the new command.

---

## v1.4.1 (2025-09-23)
**Admin Role Enforcement + Better Errors**

- Restricted moderation commands (`!warn`, `!ban`, `!pardon`, `!banlist`) to **Admins only** (Administrator permission required).
- Regular members can still use:
  - `!warnings` (to check warnings).
  - `!gkbot` (help command).
- Improved error handling:
  - Clearer message when the bot cannot ban due to Discord role hierarchy:
    > ⚠️ Could not ban this user — check the bot’s role is above theirs.

---

## v1.4.0 (2025-09-23)
**Warning System Update**

- Added `!warn` command → Admins can warn members (3 warnings = auto-ban).
- Added `!warnings` command → Members and admins can check warnings.
- Warnings reset when a user is pardoned.
- Added `!bannedlist` as alias for `!banlist`.

---

## v1.3.2 (2025-09-10)
**Command Update**

- Replaced `!help` with `!gkbot` for showing command list.

---

## v1.3.1 (2025-09-10)
**Environment Variables Update (Railway-ready)**

- Moved bot token and log channel ID to environment variables:
  - `DISCORD_TOKEN`
  - `LOG_CHANNEL`
- Safer for production (no hardcoded secrets).

---

## v1.3 (2025-09-01)
**Stability & Quality Update**

- Synced lifetime ban list with existing server bans.
- Improved leave-ban reliability.
- Commands accept mention **or raw ID**.
- `!banlist` resolves usernames/IDs, auto-splits if too long.
- Default reasons include moderator name.

---

## v1.2 (2025-08-27)
**Command & Logging Update**
- Added `!ban`, `!pardon`, `!banlist`, `!help`.
- Full reason logging with sensible defaults.

---

## v1.1
- Improved auto-ban on rejoin.
- Added join/leave logging.
- Better error output for missing permissions.

---

## v1.0 (Initial Release)
- Auto-ban users who leave (lifetime ban).
- Auto-ban if banned users rejoin.
- Basic join/leave logging.
- Keep-alive Express server.
