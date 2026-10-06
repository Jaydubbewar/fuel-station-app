# Fuel Station Billing App

Angular + Firebase (Firestore) app for entering fuel bills and tracking
per-client running balances.

## What's built so far
- **New Bill** page (`/new-bill`): form with Date (defaults to today), Bill No,
  Client (dropdown + inline "add new client"), Quantity, Rate, Discount %,
  TDS %, Credit Amount. Rate / Discount % / TDS % default from
  `src/environments/environment.ts`. Live preview of Amount, Discount Amount,
  TDS Amount, After TDS Amount as you type.
- **Dashboard** page (`/dashboard`): filter transactions by client and/or
  date range, see totals, and a full table matching your Excel columns
  (Sr No, Date, Bill No, Qty, Rate, Amount, Disc, Disc Amount, TDS, TDS
  Amount, After TDS Amount, Credit, Debit Balance).
- Debit balance is a **running ledger per client**: each new bill atomically
  reads the client's current balance and writes the new one, using a
  Firestore transaction (`runTransaction`) so two bills entered back to back
  can't corrupt the balance.

## Calculation formula (assumed — confirm this is right!)
```
Amount            = Quantity x Rate
Discount Amount   = Amount x Discount% / 100
Amount after Disc = Amount - Discount Amount
TDS Amount        = (Amount after Disc) x TDS% / 100
After TDS Amount  = Amount after Disc - TDS Amount
New Debit Balance = Previous Balance - After TDS Amount + Credit Amount
```
This lives in `src/app/utils/calculations.ts` — it's the single place to
edit if the formula needs to change.

## Setup

1. **Create a Firebase project** at https://console.firebase.google.com
   (free Spark plan is enough to start).
2. In the project, enable **Firestore Database** (start in production mode;
   we'll add security rules below).
3. In Project Settings -> General -> "Your apps", add a **Web app** and copy
   the `firebaseConfig` object.
4. Paste those values into `src/environments/environment.ts` (and
   `environment.prod.ts`), replacing the `YOUR_...` placeholders.
5. Install dependencies:
   ```bash
   npm install
   ```
6. Run locally:
   ```bash
   npm start
   ```
   App runs at http://localhost:4200

## Firestore security rules (minimum — lock this down before real use)
Since this is currently open with no login, **do not deploy this publicly
as-is**. At minimum, set Firestore rules to require auth once we add
Firebase Authentication (next step), e.g.:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Firestore composite index
The dashboard's client + date-range filter needs a composite index on the
`transactions` collection (`clientId` ASC, `date` ASC). The first time you
run that query in the browser, Firestore's error message will contain a
direct link to auto-create it in the console — just click it.

## Not yet done (next steps)
- Firebase Authentication (single login) so the app isn't publicly writable.
- Firebase Hosting deploy config.
- Editing/deleting existing bills (currently entry-only).
- Confirming the TDS/discount calculation order above.
