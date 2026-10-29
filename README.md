# Memory Records Free

**Branch: `google-play-free` — free core edition for Google Play.**

Record memories privately with text, photos, and videos, then find them with
search, tags, sorting, and more. This source branch is prepared for a separate
Play listing; it has not yet been signed, uploaded, approved, or tested on a
physical phone as this edition.

Learn about the development philosophy and see the full set of apps at
<https://portfolio-showcase-marcsebastienb.replit.app>.

## Included

- Text, photos, video clips, and the existing text-dictation control
- Dates, memory years, tags, emotions, search, grouping, sorting, and year ranks
- Surprise Me and sharing memories as image cards
- Interrupted edits recover as drafts; changes are committed only when you save
- Optional biometric/PIN app lock
- Verified local snapshots, manual snapshots, and Complete-backup reminders
- Portable Complete `.mrbak` backup/restore, plus JSON export/import

The Map screen remains disabled. Gallery GPS data can still be saved.

## Separate app identity

| Setting | Free edition |
|---|---|
| Android package | `app.memoryrecords.free` |
| Display name | Memory Records Free |
| URL scheme | `memory-records-free` |
| Current source version | 1.0.9 |
| Current Android version code | 2 |

It can coexist with the private `app.memoryrecords` app. Storage is separate.
Use a verified Complete backup to transfer memories, and keep the original app
until the imported data and media have been checked. A JSON file alone does
not carry media.

## Development and production

From the complete extracted workspace:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/memory-records exec expo start --go
```

Use Node.js 24 and pnpm 11.28.5. Native Android production builds do not depend
on Expo Go. The free branch always disables Snapshot Test mode, even when
`APP_VARIANT=snapshot-test` is present.

- [Android build and Google Play release guide](artifacts/memory-records/ANDROID_BUILD.md)
- [Play Store listing and release checklist](PLAY_STORE_LISTING.md)
- [Privacy policy draft](PRIVACY_POLICY.md) (also linked from in-app Help; complete before publication)
- [App guide](artifacts/memory-records/README.md)
- [Managing main and google-play-free separately](BRANCH_MANAGEMENT.md)

## Backup and privacy

Memories remain on the device unless you explicitly export/share them or use
an operating-system service. Local snapshots are not a replacement for a
portable backup stored outside the phone. Review the actual release binary,
SDK behavior, permissions, and data flows before making Play Data safety
declarations. A privacy policy and Play Console release requirements remain
separate publication work.

Memory Records Free does not use cookies. External services you choose to open,
share to, or use for device backups have their own privacy practices.

The linked privacy policy is still a draft: publisher identity and public
contact details must be completed before Google Play publication.

Before a first complete backup, the reminder waits until there are three
memories. Later it recommends a backup after 30 days or 25 distinct memory
changes, whichever comes first. You can snooze it for seven days; restoring
data triggers a fresh recommendation.

## Source and license

Licensed **GPL-3.0-only**. See [LICENSE](LICENSE). Retain required notices and
provide corresponding source when distributing the binary.

The source for this edition is the `google-play-free` branch of
https://github.com/Marcseb/Memory-records. The repository's `main` branch is
maintained separately and is intentionally not modified by this release.
