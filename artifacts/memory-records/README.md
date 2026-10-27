# Memory Records Free — app guide

This app directory belongs to `google-play-free`, not the full-edition `main`.

## Everyday use

Create a memory with text, photos, or a video. Add tags, an emotion, a date and,
optionally, the historical year it describes. Use Dictate for text input if
available on your device. Save, then use search, sorting, grouping, Surprise Me,
and image-card sharing to revisit memories.

Gallery GPS coordinates are saved when readable. The optional current-location
alternative is not necessarily the photo location. The Map screen is disabled.

## Protection and portability

Enable the optional biometric/PIN lock in Settings → App Security.

Automatic local snapshot checks wait for two quiet foreground minutes on the
Memories screen after changes. Capture, import, restore, and export defer them.
Use Settings → Local Snapshot History to create a snapshot immediately, restore
a verified point, or remove an older point.

Use Settings → Backup & Restore for:

- Complete `.mrbak` backup: records, settings, and accessible media.
- Complete restore: validation and media staging before merging records.
- JSON export/import: lightweight records and tags, **without media contents**.

Keep portable backups outside the phone. Verify a restore before deleting the
original installation. The free and private apps have separate storage.
Existing Pro media in backups is preserved, not deleted, but restoring it does
not enable Pro controls.

## Not included

Voice-memo recording/playback, AI Interviewer, Historical Events generation,
Obsidian vault setup, Obsidian import/export, payment recovery, activation codes,
and payment/donation/support links are unavailable in this edition.

The in-app Help screen contains this edition's guide and GPL/source links.
No checkout or donation is required to use any included feature.

For builds see [ANDROID_BUILD.md](ANDROID_BUILD.md). For branch maintenance,
see [BRANCH_MANAGEMENT.md](../../BRANCH_MANAGEMENT.md) at the repository root.
