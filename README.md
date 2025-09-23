📜 Gatekeeper Bot — Changelog

v1.5.0 (2025-09-23)

Migration to Slash Commands

✅ What’s new
	•	All commands migrated from ! prefix to Discord slash commands with autocomplete.
	•	New slash commands:
	•	/warn @member [reason] → Warn a member (Admins only; 3 warnings = auto-ban).
	•	/warnings [@member] → Check warnings for yourself or others.
	•	/clearwarns @member [reason] → Reset warnings to 0 (Admins only).
	•	/ban @member [reason] → Manual ban (Admins only).
	•	/pardon @member [reason] → Unban a member and reset warnings (Admins only).
	•	/banlist → Show all permanently banned members (Admins only).
	•	/gkbot → Show the help menu.
	•	Added embedded help message with cleaner formatting.
	•	Improved error handling for slash commands (role hierarchy & permissions).
	•	Synced warnings and bans into slash-based system.

⸻

v1.4.3 (2025-09-23)

Warning System Improvements
	•	Added !clearwarns into the !gkbot help command.
	•	Normal members can check their own warnings via !warnings.
	•	Admins can check warnings for others and clear/reset them.
	•	Improved clarity in logs for warning-related actions.

⸻

v1.4.2 (2025-09-23)

Clear Warnings Command
	•	Added !clearwarns command (Admins only).
	•	Resets a member’s warnings back to 0/3.
	•	Optional reason (default: Warnings cleared by <admin>).
	•	Logs the action in the log channel.
	•	Updated !gkbot help to include the new command.

⸻

v1.4.1 (2025-09-23)

Admin Role Enforcement + Better Errors
	•	Restricted moderation commands (!warn, !ban, !pardon, !banlist) to Admins only.
	•	Normal members can still use !warnings and !gkbot.
	•	Clearer error when the bot cannot ban due to role hierarchy.

⸻

v1.4.0 (2025-09-23)

Warning System Update
	•	Added !warn, !warnings, and auto-ban at 3 warnings.
	•	Added !bannedlist as alias for !banlist.
	•	Warnings reset when a user is pardoned.

⸻

v1.3.2 (2025-09-10)

Command Update
	•	Replaced !help with !gkbot for showing command list.

⸻

v1.3.1 (2025-09-10)

Environment Variables Update (Railway-ready)
	•	Moved bot token and log channel ID to environment variables:
	•	DISCORD_TOKEN
	•	LOG_CHANNEL
	•	Safer for production (no hardcoded secrets).

⸻

v1.3 (2025-09-01)

Stability & Quality Update
	•	Synced lifetime ban list with existing server bans.
	•	Improved leave-ban reliability.
	•	Commands accept mention or raw ID.
	•	!banlist resolves usernames/IDs, auto-splits if too long.
	•	Default reasons include moderator name.

⸻

v1.2 (2025-08-27)

Command & Logging Update
	•	Added !ban, !pardon, !banlist, !help.
	•	Full reason logging with sensible defaults.

⸻

v1.1
	•	Improved auto-ban on rejoin.
	•	Added join/leave logging.
	•	Better error output for missing permissions.

⸻

v1.0 (Initial Release)
	•	Auto-ban users who leave (lifetime ban).
	•	Auto-ban if banned users rejoin.
	•	Basic join/leave logging.
	•	Keep-alive Express server.
