# Memory Records Free — app guide

This guide applies to the `google-play-free` source branch.

## Everyday use

Create a memory with text, photos, or a video. Add tags, an emotion, a date and,
optionally, the historical year it describes. Use Dictate for text input if
available on your device. Save, then use search, sorting, grouping, Surprise Me,
and image-card sharing to revisit memories.

The search field scrolls with the list. Tap **Top / Search** above the bottom
bar to return to the top quickly.

When editing a saved memory, changes are kept in a separate local draft. If you
background or accidentally close the app, the editor restores that draft when
you return. The saved memory stays unchanged until **Save**; **Cancel** discards
the draft.

Gallery GPS coordinates are saved when readable. The optional current-location
alternative is not necessarily the photo location. The Map screen is disabled.

## Protection and portability

Enable the optional biometric/PIN lock in Settings → App Security.

Automatic local snapshot checks wait for two quiet foreground minutes on the
Memories screen after changes. Capture, import, restore, and export defer them.
Use Settings → Local Snapshot History to create a snapshot immediately, restore
a verified point, or remove an older point.

Before the first complete backup, its reminder waits until there are three
memories. Later reminders follow 30 days or 25 distinct changes, whichever
comes first; they can be snoozed for seven days. Restoring data triggers a
fresh recommendation.

Use Settings → Backup & Restore for:

- Complete `.mrbak` backup: records, settings, and accessible media.
- Complete restore: validation and media staging before merging records.
- JSON export/import: lightweight records and tags, **without media contents**.

Keep portable backups outside the phone. Verify a restore before deleting the
original installation. Different app installations keep separate storage.

The in-app Help screen contains this edition's guide and GPL/source links.

## Privacy

Memory Records Free does not use cookies. External services you choose to open,
share to, or use for device backups have their own privacy practices.

The [privacy policy draft](../../PRIVACY_POLICY.md) is also linked from the
in-app Help screen. It must be completed with the publisher identity and public
contact details before Google Play publication.

Learn about the development philosophy and discover the full set of apps:
[portfolio showcase](https://portfolio-showcase-marcsebastienb.replit.app).

For builds see [ANDROID_BUILD.md](ANDROID_BUILD.md). For branch maintenance,
see [BRANCH_MANAGEMENT.md](../../BRANCH_MANAGEMENT.md) at the repository root.
For store preparation, see the [listing and release checklist](../../PLAY_STORE_LISTING.md).
