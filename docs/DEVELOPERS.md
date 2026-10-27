# ChMS Ledger developer guide

Everything a developer needs to pick this project up: how it is put together, where the data lives, how to run and ship it, and where the planned features plug in.

Live app: https://graceandgrind101-lang.github.io/ChMS-add-on-Ledger/ (deployed from `main`).

## The product in one paragraph

A church gives a **budget** (an amount, e.g. $2,000) to a person, group or task. That person logs **expenses** against it with receipt photos. An admin or treasurer **approves** them and **pays back** anything spent from the person's own pocket. When the work is done the budget is **closed**: unspent money returns to the church, the person gets a saver badge and points, and a printable **report** is produced. Everything is recorded in a **ledger**. There is deliberately **no server**: data lives on each phone, moves between phones by invite links and update files, and backs up to the user's own Google Drive.

## Run, test, build

```bash
npm install
npm run dev      # http://localhost:5173 (copies the OCR engine into public/ocr first)
npm test         # vitest: budget math, rewards, receipt parsing, sharing, invites
npm run build    # type-check (tsc -b) + production build in dist/
npm run preview  # serve dist/ locally
```

- Node 22 (what CI uses).
- **Try the demo** on the sign-in screen gives you a full example church and a guided tour. **More → Using the app as** switches people, so one browser can play treasurer and missionary.
- Every pull request runs type-check, tests and build (`.github/workflows/ci.yml`). Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| UI | React 18 + TypeScript, Vite 6 | Small, fast, no framework lock-in |
| Offline/install | `vite-plugin-pwa` (Workbox, autoUpdate) | Works without internet, installs from the browser |
| Database | Dexie 4 on IndexedDB, `dexie-react-hooks` `useLiveQuery` | Local-first; views re-render when data changes |
| OCR | tesseract.js, self-hosted in `public/ocr` | No CDN or server needed; cached after first use |
| Routing | Hash routes (`#/budget/<id>`) in `src/router.ts` | Works on any static host, including GitHub Pages |
| Styling | One CSS file, CSS variables for light/dark | No build-time CSS tooling to maintain |

## File map

```
src/
  main.tsx          boot: apply theme, register service worker, open DB, render (or StorageBlocked)
  App.tsx           shell: app bar, routes, floating + button, bottom tabs, demo tour
  db.ts             Dexie schema, types, uid(), today(), getSetting/setSetting
  actions.ts        every write that touches money (each writes its ledger line in the same transaction)
  logic.ts          pure functions: summarize, budgetAlerts, reminders, scoreCloseOut, parseReceiptText, spendByCategory
  calendar.ts       .ics event for a budget's end date (phone calendar does the notifying)
  money.ts          cents, currency formatting (per-church currency), parseMoney
  session.ts        roles, canManage(), current user (useMe/setMe), linkSamePerson()
  backup.ts         exportSnapshot / importSnapshot (replace) / mergeSnapshot (newest-wins)
  invite.ts         invite links: build, compress into the URL, decode, accept
  google.ts         Google Identity Services sign-in + Drive appDataFolder backup/restore
  useAutoBackup.ts  debounced (15 s) Drive backup after any change, when online and signed in
  ocr.ts            compressImage + readReceipt (tesseract) -> ParsedReceipt
  csv.ts            CSV export, share sheet with download fallback
  demo.ts, Tour.tsx, sample.ts   demo mode, guided tour, example data
  theme.ts          light / dark / match device
  Fatal.tsx         error boundary and "storage blocked" screens
  icons.tsx         inline SVG icons, progress ring
  views/            one file per screen (Budgets, BudgetDetail, AddExpense, Approvals, Ledger,
                    Report, NewBudget, More, Login, Join, Expenses search) + shared parts
public/             icon, privacy.html, terms.html, demo-receipt.jpg (ocr/ is generated, gitignored)
scripts/copy-ocr.mjs  copies tesseract worker/core/eng data from node_modules into public/ocr
```

## Data model (`src/db.ts`)

All money is **integer cents** (`Cents`). Dates are `YYYY-MM-DD` strings in the device's time zone.

| Table | Key | What it holds |
| --- | --- | --- |
| `people` | `id` | name, optional Google email, `role`: admin, treasurer, leader, missionary, volunteer |
| `budgets` | `id` | name, purpose, assignee, `amount`, start/end date, `status` active/closed, `cycle`, `previousId` when renewed |
| `expenses` | `id` | budget, date, merchant, category, amount, `paidWith` budget/own, `status` pending/approved/rejected/withdrawn, `reimbursement` none/owed/paid, optional `receiptId`, OCR text, who decided |
| `receipts` | `id` | the compressed photo `Blob` |
| `ledger` | `++seq` | append-only lines: allocation, expense, reimbursement (memo), return, top-up; `moneyIn`/`moneyOut` |
| `closeouts` | `id` | result of closing a budget: spent, saved, %, badge, points |
| `settings` | `key` | key/value. Keys starting with `device.` stay on this device (current user, theme, demo, Google profile); others travel in backups and shares (`churchName`, `currency`) |

Rules worth knowing:

- **Only admins and treasurers** (`canManage`) create budgets, approve, pay back and close. On the Budgets and Approvals screens others see only their own budgets and expenses; the Ledger screen shows everything on the device.
- **Write money through `actions.ts`**, never straight to the tables, so the ledger stays complete. Ledger lines are never edited.
- Expenses can be edited or withdrawn only while pending or rejected (`canEditExpense`); approved ones are locked. Nothing is hard-deleted: withdrawing sets status `withdrawn`, because the newest-wins merge has no deletes and a removed row would come back from another phone.
- People, budgets and expenses carry `updatedAt`, stamped by Dexie hooks. `mergeSnapshot` keeps the newest copy of each; ledger, close-outs and receipts are added if missing.
- A schema change needs a new `this.version(n)` in `db.ts`, with an upgrade function if existing data must change.

## How data moves without a server

| Path | Code | Notes |
| --- | --- | --- |
| Invite link | `invite.ts`, `views/Join.tsx` | Person, role, church, currency and their budgets with expenses and ledger, deflate-compressed into `#/join?i=...` (about 650 characters for one budget). Re-sending shares new budgets. |
| Send / Receive updates | `backup.ts`, More screen | A JSON file through the share sheet; receiving merges newest-wins and links duplicate people by email or name. |
| Google Drive backup | `google.ts`, `useAutoBackup.ts` | One file, `chms-ledger-backup.json`, in the hidden appDataFolder. Restored on sign-in on a new phone. |
| Backup file | More screen | Save/restore the whole device as JSON (restore replaces). |

## Extension points (planned work)

- **Central ChMS API (live sync).** Replace file sharing with API calls. `exportSnapshot()` and `mergeSnapshot()` already define the data shape and the merge rule; a sync job can push local changes (`updatedAt` newer than the last sync) and merge what comes back. Put API keys in a server or proxy, never in the browser bundle.
- **Gemini receipt reading.** Swap or extend `readReceipt()` in `src/ocr.ts`; it must return `ParsedReceipt` (merchant, date, total) plus text. Call Gemini through a small proxy so the key is not exposed in the PWA.
- **Email-in receipts.** Needs a server (inbound email webhook). Today users paste the email text.
- **Notifications.** No push server exists. Reminders show on the home screen (`reminders()` in `logic.ts`), as the installed app's icon badge, and as calendar alerts via `calendar.ts`. Real push notifications need a server with Web Push.

## Google sign-in (currently parked)

The hosted build includes the OAuth client ID (`pages.yml`, overridable with a `GOOGLE_CLIENT_ID` Actions variable; locally use `VITE_GOOGLE_CLIENT_ID` in `.env.local`). Scopes: `openid email profile https://www.googleapis.com/auth/drive.appdata`. Without a client ID the app runs device-only.

To make it work, in Google Cloud → Google Auth Platform:

1. **Clients → the web client → Authorized JavaScript origins:** `https://graceandgrind101-lang.github.io` (origin only, no path) and `http://localhost:5173`. It was set to `https://localhost:3000`, which is why sign-in failed. No redirect URI is needed: the app uses the Google Identity Services popup token flow.
2. **Audience:** while in Testing, add each user's Gmail as a test user.
3. Publishing to everyone needs Google's verification: site ownership in Search Console, branding with `privacy.html` and `terms.html`, and review of the `drive.appdata` scope.

## Deploy

GitHub Pages, **Settings → Pages → Source: GitHub Actions**. `BASE_PATH=/<repo>/` makes the build work under the repo path. The service worker updates itself; users get the new version the next time they open the app.

## Known limits

- iPhone keeps a home-screen app's storage separate from Safari. If an invite link opens in Safari, users can paste it into **Have an invite link?** on the sign-in screen of the installed app.
- Anyone holding an invite link can read the budgets in it. Treat links as private.
- Roles are enforced by the app's screens, not by encryption: whatever is on a phone can be read by its owner. A missionary's phone holds only their own budgets when set up by invite, but a full update file from the treasurer carries everything.
- Currency is one per church and relabels amounts; it never converts.
- Receipt photos are not included in invite links (only in update files and backups), to keep links short.
