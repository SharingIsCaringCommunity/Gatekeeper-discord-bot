# 📜 Gatekeeper Bot — Changelog

## v1.3 (2025-09-01)
**Stability & quality update for lifetime-ban workflow (matching current code).**

### ✅ What’s new
- **Startup sync with server bans:** imports all existing guild bans into the in-memory lifetime list.
- **Stronger leave-ban:** uses `guild.members.ban(id)` so the ban still works even after the user leaves.
- **Commands accept mention or raw ID:** `!ban @user|<id> [reason]`, `!pardon @user|<id> [reason]`.
- **Readable ban list:** `!banlist` resolves and shows `username#discriminator (ID)` when possible; falls back to `(unknown user)` if Discord can’t fetch.
- **Large list handling:** auto-splits long `!banlist` output to respect Discord’s 2000-char limit.
- **Reason logging kept:** default reasons include moderator name when none is provided:
  - Ban → `Manual ban by <moderator>`
  - Pardon → `Pardon issued by <moderator>`

## v1.2
**Added manual ban, pardon, banlist, and help commands, full reason logging for all bans/pardons + improved logs.**

### 🆕 What’s new
1. **Manual Ban Command**
   - `!ban @user [reason]` → Bans user + adds to lifetime ban list.
   - If no reason is given → defaults to **Manual ban by `<moderator>`**.

2. **Pardon Command**
   - `!pardon @user [reason]` → Unbans user + removes from lifetime ban list.
   - If no reason is given → defaults to **Pardon issued by `<moderator>`**.

3. **Ban List Command**
   - `!banlist` → Shows all users currently in the lifetime ban list.

4. **Help Command**
   - `!help` → Displays all available commands with usage examples.

5. **Clearer Reason Logging**
   - All bans/pardons now log the moderator’s username if no reason is provided.
   - Keeps logs clear and avoids “empty reason” issues.

---

## v1.1
- Improved auto-ban on rejoin (lifetime ban).
- Added logging for join/leave events.
- Fixed issues with missing permissions logging.

## v1.0
- Initial release.
- Auto-ban users who leave and try to rejoin.
- Basic logging for joins/leaves.
