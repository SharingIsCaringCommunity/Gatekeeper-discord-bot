# 📜 Gatekeeper Bot — Changelog

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.5.0-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>

---

## v1.5.0 (2025-09-23)  
**🚀 Migration to Slash Commands**

### What’s new
- Migrated from `!` prefix to **Discord slash commands** with autocomplete.
- Added commands:
  - `/warn @member [reason]` → Warn a member (Admins only; 3 warnings = auto-ban).
  - `/warnings [@member]` → Check warnings (anyone).
  - `/clearwarns @member [reason]` → Reset warnings (Admins only).
  - `/ban @member [reason]` → Manual ban (Admins only).
  - `/pardon @member [reason]` → Unban & reset warnings (Admins only).
  - `/banlist` → Show permanently banned users (Admins only).
  - `/gkbot` → Help menu (embedded).
- Better error handling for role hierarchy/permissions.
- Synced warnings & bans to the slash-command flow.

---

## v1.4.3 (2025-09-23)  
**⚠️ Warning System Improvements**
- Added `!clearwarns` to the `!gkbot` help.
- Members can check their own warnings; admins can check/clear others.
- Clearer log messages for warning actions.

---

## v1.4.2 (2025-09-23)  
**🧹 Clear Warnings Command**
- New `!clearwarns` (Admin only) to reset warnings to 0/3.
- Optional reason (default: `Warnings cleared by <admin>`).
- Logged to the server log channel.
- Help updated.

---

## v1.4.1 (2025-09-23)  
**🔐 Admin Enforcement + Better Errors**
- Restricted moderation (`!warn`, `!ban`, `!pardon`, `!banlist`) to **Admins**.
- Members can still use `!warnings` and `!gkbot`.
- Clearer message when a ban fails due to role hierarchy.

---

## v1.4.0 (2025-09-23)  
**⚖️ Warning System**
- `!warn` for admins; `!warnings` for members/admins.
- Auto-ban at 3 warnings.
- Added `!bannedlist` alias for `!banlist`.
- Warnings reset on pardon.

---

## v1.3.2 (2025-09-10)  
**ℹ️ Command Update**
- Replaced `!help` → `!gkbot`.

---

## v1.3.1 (2025-09-10)  
**🔧 Environment Variables (Railway-ready)**
- Moved secrets to ENV vars:
  - `DISCORD_TOKEN`
  - `LOG_CHANNEL`
- No more hardcoded tokens.

---

## v1.3 (2025-09-01)  
**🛠 Stability & Quality**
- Synced lifetime bans on startup.
- Improved leave-ban reliability.
- Accepts raw ID or mention in commands.
- `!banlist` resolves usernames and auto-splits long output.
- Default reasons include moderator name.

---

## v1.2 (2025-08-27)  
**📜 Commands & Logging**
- Added `!ban`, `!pardon`, `!banlist`, `!help`.
- Full reason logging everywhere.

---

## v1.1  
**🔄 Auto-ban Improvements**
- Stronger auto-ban on rejoin.
- Join/leave logging.
- Better errors for missing permissions.

---

## v1.0 (Initial Release)  
**🎉 Features**
- Auto-ban users who leave (lifetime ban) and if they rejoin.
- Basic join/leave logging.
- Keep-alive Express server.
