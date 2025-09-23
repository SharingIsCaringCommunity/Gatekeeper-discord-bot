# 📜 Gatekeeper Bot — Changelog

![version](https://img.shields.io/badge/version-v1.5.0-blue)  
![status](https://img.shields.io/badge/status-stable-brightgreen)  
![license](https://img.shields.io/badge/license-MIT-lightgrey)

---

## v1.5.0 (2025-09-23)  
**🚀 Migration to Slash Commands**

### ✅ What’s new
- Migrated from `!` prefix to **Discord slash commands** with autocomplete.  
- Added commands:
  - `/warn @member [reason]` → Warn a member (Admins only; 3 warnings = auto-ban).  
  - `/warnings [@member]` → Check warnings (anyone can use).  
  - `/clearwarns @member [reason]` → Reset warnings (Admins only).  
  - `/ban @member [reason]` → Manual ban (Admins only).  
  - `/pardon @member [reason]` → Unban & reset warnings (Admins only).  
  - `/banlist` → Show all permanently banned users (Admins only).  
  - `/gkbot` → Show help menu.  
- Added embedded help message with cleaner formatting.  
- Improved error handling for hierarchy/permissions.  
- Synced warnings & bans with slash-based flow.  

---

## v1.4.3 (2025-09-23)  
**⚠️ Warning System Improvements**
- Added `!clearwarns` to help menu.  
- Normal members can check their own warnings.  
- Admins can check/clear warnings.  
- Improved logging for warnings.  

---

## v1.4.2 (2025-09-23)  
**🧹 Clear Warnings Command**
- Added `!clearwarns` (Admins only).  
- Resets a member’s warnings to 0/3.  
- Accepts optional reason.  
- Logs all actions.  
- Help updated.  

---

## v1.4.1 (2025-09-23)  
**🔐 Admin Role Enforcement + Errors**
- Restricted moderation (`!warn`, `!ban`, `!pardon`, `!banlist`) to Admins only.  
- Members still use `!warnings` & `!gkbot`.  
- Clearer role hierarchy error message.  

---

## v1.4.0 (2025-09-23)  
**⚖️ Warning System**
- Added `!warn` (Admins only).  
- Added `!warnings` (members & admins).  
- Auto-ban at 3 warnings.  
- `!bannedlist` alias added.  

---

## v1.3.2 (2025-09-10)  
**ℹ️ Command Update**
- Replaced `!help` → `!gkbot`.  

---

## v1.3.1 (2025-09-10)  
**🔧 Environment Variables**
- Moved to ENV vars (`DISCORD_TOKEN`, `LOG_CHANNEL`).  
- Railway/Heroku ready.  

---

## v1.3 (2025-09-01)  
**🛠 Stability & Quality**
- Synced lifetime bans on startup.  
- Improved leave-ban reliability.  
- Accepts raw ID or mention.  
- `!banlist` resolves usernames.  
- Default reasons include moderator name.  

---

## v1.2 (2025-08-27)  
**📜 Command & Logging**
- Added `!ban`, `!pardon`, `!banlist`, `!help`.  
- Full reason logging.  

---

## v1.1  
**🔄 Auto-ban Update**
- Improved auto-ban on rejoin.  
- Added join/leave logging.  
- Better permission errors.  

---

## v1.0 (Initial Release)  
**🎉 Features**
- Auto-ban users who leave (lifetime ban).  
- Auto-ban if rejoined.  
- Join/leave logging.  
- Keep-alive Express server.  
