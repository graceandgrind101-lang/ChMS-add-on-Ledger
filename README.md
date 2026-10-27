# ChMS Ledger

A phone-first budget and receipt ledger for church ministry teams. The church gives a person, group, or task a budget (for example $2,000 for a mission trip). They log expenses against it with receipt photos. The treasurer approves expenses, pays people back, and closes the budget out when they report back.

It works fully offline. Data is saved on the device first and, when the user signs in with Google, backed up to their own Google Drive.

## What it does

- **Budgets** assigned to a person or group, with an optional expiry date. A budget must exist before expenses can be logged.
- **Receipts** by camera, gallery upload, or pasting the text of an emailed receipt. Tesseract OCR reads the store, date, and total in the browser, no server needed.
- **Approvals**: expenses from leaders, missionaries, and volunteers wait for an admin or treasurer.
- **Paybacks**: expenses paid from someone's own pocket are tracked as owed until marked paid back.
- **Ledger**: every budget given, expense, payback, return of unspent money, and top-up, with a running balance. Downloadable as CSV for spreadsheets.
- **Warnings and rewards**: alerts when a budget is running low, overspent, spending too fast, or about to expire. Closing a budget scores it: saving 10% earns *Faithful steward*, 25% earns *Wise saver*, and points add up on a leaderboard.
- **Close out or reset**: unspent funds go back to the church on the ledger, and an optional new round of the same budget starts.
- **Share between phones without a server**: *More → Send updates* opens the phone's share sheet (WhatsApp, email) with a file; *Receive updates* merges it, keeping the newest version of each budget and expense. A missionary sends expenses to the treasurer, the treasurer sends approvals and budgets back.
- **Backup**: automatic Google Drive backup (hidden app folder, like WhatsApp), plus a backup file you can save and open.
- **Budget report**: a one-page report per budget with category breakdown and signature lines; print or save as PDF.
- **Church setup and invite links**: the treasurer names the church, picks its currency, and sends each person a link that sets up their phone with their budgets.
- **Fix, find and remember**: edit or withdraw an expense before approval, resubmit a rejected one, search and filter all expenses, a *Needs attention* list, and calendar alerts before a budget ends.
- **Demo mode**: *Try the demo* on the sign-in screen loads an example church with a guided 8-step tour.

**Developers:** start with the [developer guide](docs/DEVELOPERS.md).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for budget math, rewards, and receipt reading
npm run build    # production build in dist/
```

Use **Try the demo** on the sign-in screen (or **More → Load demo data**) for a sample church. **More → Using the app as** switches between people to show the treasurer and missionary views on one device.

## Turn on Google sign-in and Drive backup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Set up the **OAuth consent screen** (External). Add the scope `.../auth/drive.appdata`. While in Testing, add the Google accounts that will try it as test users.
3. Create **Credentials → OAuth client ID → Web application**. Under *Authorized JavaScript origins* add `http://localhost:5173` and your site's origin with no path, e.g. `https://graceandgrind101-lang.github.io`. No redirect URI is needed (the sign-in uses a popup).
4. For local runs, put the client ID in `.env.local` as `VITE_GOOGLE_CLIENT_ID=...`. The hosted site uses the ID in `.github/workflows/pages.yml`, unless a `GOOGLE_CLIENT_ID` Actions variable is set.

Without a client ID the app runs in device-only mode.

## Host it free on GitHub Pages

In the repo, open **Settings → Pages** and set *Source* to **GitHub Actions**. Every push to `main` then tests, builds, and publishes the app. Pull requests run the same tests and build as a check. On a phone, open the site and choose *Add to Home screen* to install it.

## How it is built

- React + TypeScript + Vite, installable as a PWA (works offline after the first visit).
- [Dexie](https://dexie.org/) on IndexedDB for the on-device database (`src/db.ts`).
- Money is stored as whole cents. Ledger entries are written in the same transaction as the change they record (`src/actions.ts`).
- Budget math, warnings, rewards, and receipt text parsing are plain functions in `src/logic.ts` with tests.
- The OCR engine and English data are served from the app itself (`scripts/copy-ocr.mjs`) and cached after the first receipt.

## Not yet

- **Live sync between phones.** Until the central ChMS API is connected, phones exchange update files (above). `exportSnapshot()` and `mergeSnapshot()` in `src/backup.ts` are where that API plugs in; records carry `updatedAt` for newest-wins merging.
- **Forwarding receipts to an email address.** This needs a server. For now, paste the email text or upload a screenshot or photo.
- **Gemini receipt extraction.** Plug in at `readReceipt()` in `src/ocr.ts`.
