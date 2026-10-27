# Managing the full and free editions separately

## Rules

| Branch | Role | Android package |
|---|---|---|
| `main` | Existing full edition; default future development | `app.memoryrecords` |
| `google-play-free` | Free core-only Google Play edition | `app.memoryrecords.free` |

The free branch reserves Obsidian integration for Pro. It does **not** reclassify
or remove anything on `main`. Main's existing feature split and payment
mechanisms stay as they are unless separately requested.

The free build disables voice memos, AI tools, Obsidian, and all payment/support
entry points. Backups and JSON portability stay free.

## Safest setup: two folders

Avoid switching a working Replit project that contains local uploads, `.env`
files, and running workflows back and forth. Use two separate checkouts:

```sh
git clone --branch main https://github.com/Marcseb/Memory-records.git memory-records-full
git clone --branch google-play-free https://github.com/Marcseb/Memory-records.git memory-records-free
```

Each folder has its own dependencies, generated native project, and build
outputs. Signing files belong outside both folders.

The existing Replit workspace stays on full-edition `main`. The free edition
can be worked on in a separate clone/project. Verify the branch before edits:

```sh
git branch --show-current
git status --short
```

Do not assume the Replit workspace's history is the public GitHub history.
Public syncs must continue using reviewed sanitized snapshots; never push the
full Replit history, tracked uploads, account settings, or signing assets.

## Update one branch without changing the other

In the appropriate checkout, with no uncommitted work:

```sh
git fetch origin
git pull --ff-only
```

Check the branch name, make/test your changes, commit only reviewed source, and
push explicitly to that branch. Do not use force-push. A free-only UI or policy
change belongs on `google-play-free`, not `main`.

## Transfer selected fixes from public main to free

In the **free checkout**:

```sh
git fetch origin
git log --oneline HEAD..origin/main
git show COMMIT_SHA
git cherry-pick COMMIT_SHA
```

Use a real reviewed public commit SHA. Do not cherry-pick unrelated Pro/payment
changes automatically. For a mixed commit, review it on a temporary integration
branch and adapt it instead of copying the entire change blindly.

If conflicts occur, stop and inspect them. Use `git cherry-pick --abort` to
return to the pre-operation state if uncertain. Never resolve conflicts by
accepting all of `main` without reviewing the edition-specific files.

Before pushing transferred changes, preserve/recheck:

- `constants/edition.ts`: Pro remains disabled.
- `app.json` / `app.config.js`: free package, scheme, and no Snapshot Test mode.
- `UnlockContext.tsx`: no network, cache, payment recovery, or activation.
- `UnlockModal.tsx`: no rendered checkout.
- Obsidian handler guards and Markdown import rejection.
- Settings, capture, detail, and Help screens: no Pro/support entry points.
- Root/app READMEs and Android guide remain specific to Free.

Then run:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/memory-records run typecheck
pnpm --filter @workspace/memory-records run test:free-edition
pnpm --filter @workspace/memory-records run test:android-build
pnpm run android:check
```

Run relevant backup/snapshot tests too when transferring storage changes, and
test the actual APK before uploading a new AAB.

To transfer a free-branch bug fix back to main, use the same review/cherry-pick
process in the full checkout. Do not bring over free restrictions accidentally.

## Release separately

Raise version codes independently for each package. Never reuse a Play version
code already uploaded for that listing. Save your release commit/tag, AAB/APK,
and matching source ZIP. Tags can distinguish editions, for example
`free-1.0.8-build1` and `full-1.0.8-build9`.

The apps store data separately and neither installation updates automatically
when source is edited. Use verified Complete backups for transfers; JSON alone
does not include media. A free app published on Play cannot later be converted
to a paid-download listing; a separate Pro product or an eligible in-app
purchase model would be separate work.
