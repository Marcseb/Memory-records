# Memory Records Free

**Branch: `google-play-free` — free core edition for Google Play.**

Record memories privately with text, photos, and videos. No premium checkout,
activation-code screen, advertisements, or donation/support payment links.
This source branch is prepared for a separate Play listing; it has not yet been
signed, uploaded, approved, or tested on a physical phone as this edition.

## Included

- Text, photos, video clips, and the existing text-dictation control
- Dates, memory years, tags, emotions, search, grouping, sorting, and year ranks
- Surprise Me and sharing memories as image cards
- Optional biometric/PIN app lock
- Verified local snapshots, manual snapshots, and Complete-backup reminders
- Portable Complete `.mrbak` backup/restore, plus JSON export/import

The Map screen remains disabled. Gallery GPS data can still be saved.

## Edition boundary

Voice memos, AI Interviewer, Historical Events generation, and **all Obsidian
integration** are reserved for the full/Pro edition and unavailable here. This
includes single/bulk Obsidian export, vault setup, Markdown import/paste, and
Obsidian-related prompts. Basic backups and JSON portability remain free.

Pro source may be retained for maintenance, but the free build cannot activate
it through a payment, cached unlock, restored setting, or activation code.
This edition makes no premium-status or AI-service requests. Backups may retain
Pro-era audio and metadata without exposing recording/playback or enabling Pro.

## Separate app identity

| Setting | Free edition |
|---|---|
| Android package | `app.memoryrecords.free` |
| Display name | Memory Records Free |
| URL scheme | `memory-records-free` |
| Initial source version | 1.0.8 |
| Initial Android version code | 1 |

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
- [App guide](artifacts/memory-records/README.md)
- [Managing main and google-play-free separately](BRANCH_MANAGEMENT.md)

## Backup and privacy

Memories remain on the device unless you explicitly export/share them or use
an operating-system service. Local snapshots are not a replacement for a
portable backup stored outside the phone. Review the actual release binary,
SDK behavior, permissions, and data flows before making Play Data safety
declarations. A privacy policy and Play Console release requirements remain
separate publication work.

The API-server source remains in the workspace for shared development, but this
free client does not use the premium payment/unlock endpoints.

## Source and license

Licensed **GPL-3.0-only**. See [LICENSE](LICENSE). Retain required notices and
provide corresponding source when distributing the binary.

The source for this edition is the `google-play-free` branch of
https://github.com/Marcseb/Memory-records. The repository's `main` branch is the
full edition and is intentionally not modified by this release.
