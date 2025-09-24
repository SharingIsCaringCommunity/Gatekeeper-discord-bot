# 📜 Gatekeeper Bot — Changelog

<p align="left">
  <img src="https://img.shields.io/badge/version-v1.6.1-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge" />
</p>

---

## v1.6.1 (2025-09-24)  
**Warnings → Lifetime Ban (3 strikes system)**  

### ✅ What’s new
- **Auto-ban improvements:**  
  - On reaching **3 warnings**, users are now **lifetime banned automatically**.  
  - The bot replies publicly: `⚠️ User reached 3 warnings and was banned 🚫`.  
  - Lifetime ban list is updated instantly.  
- **DM enhancements:**  
  - When a user is warned, they receive a **DM embed** with:  
    - Reason for the warning.  
    - Current warning count.  
    - Who warned them.  
    - Optional link to server rules (`RULES_LINK`).  
  - If banned at 3 warnings, the DM clearly shows **who banned them** and why.  
- **Logging:**  
  - Logs now record:  
    - Who warned/banned the user.  
    - If the ban was triggered by reaching 3 warnings.  
    - Mentions (`<@user>`) instead of plain tags for easier navigation.  

### 🔄 Improvements
- Cleaner warning/banning flow with emojis for readability.  
- More user-friendly DM layout with embeds instead of plain text.  

---

## v1.6.0 (2025-09-24)  
**Pagination & UX Upgrade**  

- Added **paginated banlist** (`/banlist`) with **Prev / Next / Refresh / Close** buttons.  
- Added **paginated warnlist** (`/warnlist`) for admins to review members with warnings.  
- Only command invoker can use pagination controls.  
- Everyone can use `/warnings` to check their own (or others’) warnings.  
- Emojis added across commands for clearer context.  

---

## v1.5.9 (2025-09-24)  
**Mentions + Logs Update**  

- `/warn`, `/pardon`, `/clearwarns` now show **user mentions** (`<@id>`) instead of plain tags.  
- Logs also updated to include mentions for quick profile access.  

---

## v1.5.8 (2025-09-24)  
**Banlist + Warnlist Fixes**  

- `/banlist` and `/warnlist` show properly sorted lists.  
- Fixed crash when lists exceeded length limits by adding pagination prep.  
- Clearer error handling when fetching users fails.  

---

_(Earlier versions v1.5.7 → v1.0 omitted for brevity but remain in repo history.)_
