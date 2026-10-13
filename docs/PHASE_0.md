# Phase 0 — Foundation & Masters

Built 2026-10-13 on site `sugarcane.local` (Frappe 16.34, ERPNext 16.35, HRMS 16.19, WhatsApp 1.0).

## What was built

**Site & app**
- Site `sugarcane.local` (developer mode, `host_name http://sugarcane.local:8006`), apps frappe, erpnext, hrms, whatsapp, sugarcane.
- App `sugarcane` with the 14 modules. `pyproj` and `shapely` are declared in `pyproject.toml` and installed.
- Procfile entries `web_sugarcane` (:8006) and `sugarcane_ui` (React dev server on :5179).
- Company **MicroMax Sugar Mills Ltd.** (MSML, PKR, Asia/Karachi, fiscal year July–June) via `sugarcane.setup.company.ensure_company`.

**Settings** — Sugar Settings (Single: company, active season, maund kg, crushing day start 07:00, survey/geofence/tracking
values, weighbridge IP check, all cane ledgers, cane item, yard warehouse, internal supplier), Crushing Season (rates,
cess and its grower share, subsidy, additional subsidy, TPT, binding 0.265 kg/quintal, garbage, recovery, NRVs; only one
open season per company, and opening one makes it the active season), Crushing Shift.

**Masters**
| Area | Sources | Crop | Vehicles |
|---|---|---|---|
| Sugar Division → Sugar District → Sugar Zone → Cane Circle (3-digit code) → Cane Sector (`001-S01`) → Cane Village (`001-001`) | Cane Source (gate / check post / depot, TPT by vehicle type), Loading Point, Cane Depot (geofence, users) | Cane Variety, Crop Disease | Vehicle Type (weight limits, binding/garbage overrides), Sugar Vehicle, Vehicle Lane, Weighbridge Terminal |

**Grower as an ERPNext Party Type**
- `Grower` DocType, ID = **circle code − village code − serial** (`001-001-0001`), serial per village from the Series table.
- Validates CNIC (`#####-#######-#`, unique, accepts digits without dashes), village-in-circle and the IBAN checksum.
- Party Type fixture `Grower` (Payable). Every grower gets a Party Account row → **Grower Payable**, so ERPNext's
  `get_party_account`, Journal Entry, Payment Entry and General Ledger work with `party_type = Grower`.
- Bank details create and keep in step an ERPNext **Bank Account** (party Grower), named `<grower ID> <title> - <bank>`.
- **Grower Passbook** (land holdings, acres → kanal, one active passbook per grower; it sets `Grower.passbook_no`).
- **Grower Import**: XLSX/CSV, background job, template download, per-row savepoints, error sheet with an `error` column.

**Accounts & stock** (`sugarcane.setup.accounts.setup_company`, also the *Set Up Accounts* button on Sugar Settings; runs on
every migrate, never overwrites a filled-in setting)
- Grower Payable, Cane Purchase Clearing (Payable), TPT-Bilty Payable, Road Cess Payable - Govt, Grower Loan Receivable,
  Cash Counter - Cane, and the **Cane Cost of Sales** group: Cane Purchase A-c (Govt), Subsidy Purchase, Additional Subsidy,
  Road Cess - Mill Share.
- Warehouse Cane Yard, item SUGARCANE (Kg; Maund = 40 kg), UOM Maund, supplier groups Cane Contractor / Cane Internal,
  internal supplier **Daily Cane Purchase** (payable account = Cane Purchase Clearing).

**CPR formula, ahead of Phase 3** — `sugarcane/calc/cpr.py` implements the approved rules (binding 0.265 kg/quintal, road cess
split 50/50 grower/mill, subsidy + additional subsidy, TPT per maund, loan cap, no WHT) and the balanced Journal Entry lines.
Rate resolution (Loading Point → Source → Circle → Season) is in `sugarcane/calc/rates.py`.

**Roles & scoping** — 15 roles (fixture + created on install). Masters are writable by System Manager / Cane Manager / Cane
Admin and readable by all cane roles. Circle Officers write growers and passbooks. Scoping uses User Permissions on
**Cane Circle**, tested end to end: a north-zone officer sees 4 circles and 200 growers.

**Desk** — Sugarcane workspace, sidebar and desktop icon.

**React** (`frontend/`, React 18 + TS + Vite + frappe-react-sdk + Tailwind + TanStack Table; built to
`sugarcane/public/frontend`, served at **/sugar** by `www/sugar.html`)
- Login, layout with a role-aware menu (later-phase screens show their phase), light/dark theme, season badge.
- Home: season card, counts and a circle table, all scoped to what the user may see.
- Growers: search by name, CNIC, ID, passbook or village, circle filter, paging (`sugarcane.api.v1.growers.search`).
- APIs: `sugarcane.api.v1.app.boot`, `sugarcane.api.v1.app.home`, `sugarcane.api.v1.growers.search`.

**Demo data** (`bench --site sugarcane.local sc-demo`, `sc-reset-demo` deletes only `is_demo` records)
- Season 2026-27 (Open, 1 Nov – 31 Mar; govt rate 425, cess 1% with a 50% grower share, subsidy 10, additional 5, TPT 30,
  binding 0.265). These are demo values; set the real notified rates before going live.
- 3 zones (Sargodha / Khushab / Jhang), 12 circles, 36 sectors, 150 villages ("Chak n NB/SB/JB/MB"), 500 growers with
  passbooks (406 with bank accounts and valid-checksum IBANs), 7 sources, 6 loading points, 3 depots, 6 contractors,
  5 vehicle types, 3 lanes, 119 vehicles, 10 varieties, 8 diseases, 3 shifts, 3 terminals (simulator).
- 16 demo users, one per role: `<role>@micromaxsugar.example`, e.g. `cane.manager@`, `circle.north@` (4 north circles),
  `circle.south@`, `cane.cashier@`. Their password is `STAFF_DEMO_PASSWORD` in `~/.sugarcane-site-secrets`; the
  Administrator password is in the same file.

## How to test

```bash
# tests (31): CPR formula & JE balance, units, CNIC/IBAN/grower ID, rates, grower IDs per village, Grower JE + Payment
# Entry, Bank Account, passbook, circle scoping, import with good and bad rows, vehicles, terminals, seasons
bench --site sugarcane.local run-tests --app sugarcane

# demo data again from scratch
bench --site sugarcane.local sc-reset-demo
```

- **Desk:** `bench start` (or `bench --site sugarcane.local serve --port 8006`), open http://sugarcane.local:8006/app/sugarcane.
  Try Grower → new (the ID appears on save), Grower Import → Download Template, Sugar Settings → Set Up Accounts.
- **React:** `cd apps/sugarcane/frontend && npm run dev`, open http://sugarcane.local:5179 (or sugarcane.localhost:5179
  before the hosts line exists). The built app is at http://sugarcane.local:8006/sugar. Sign in as `circle.north@…` to see
  the scoped home and growers; `cane.cashier@…` sees only the gate/cashier menu.
- **Hosts line** (needs sudo, not done): `echo "127.0.0.1 sugarcane.local" | sudo tee -a /etc/hosts`.
- **Clean install:** a throwaway site `sc-installtest.local` was created with erpnext + hrms + sugarcane, migrated, and ran
  the full test suite: 31 tests passed. The site was then dropped.

## Known gaps / decisions to confirm

1. **Cane Purchase A/c (Govt).** It is created under Cane Cost of Sales, but under the approved rules the govt value goes
   CPR JE → Cane Purchase Clearing → daily Purchase Invoice (update_stock) → **Cane Yard stock** → production. So with
   perpetual inventory nothing posts to Cane Purchase A/c (Govt) yet. Options: (a) keep it as a reporting heading and
   show cane purchases from the Daily Cane Purchase report; (b) when production consumes cane, post the consumption
   variance there; (c) drop stock for cane and expense the daily invoice to it (that breaks the stock-based production
   costing in the spec). **Default: (a); decide before Phase 3.**
2. Binding is read as **0.265 kg per quintal of net weight**, i.e. 0.265% (14,200 kg → 38 kg). If it means something else
   (e.g. per maund, or maund per quintal) it's one field on the season.
3. Garbage/trash wasn't specified: it's configurable (% of net and/or fixed kg, per vehicle type) and 0 in the demo.
4. The road cess rate (1%) and other demo season values are placeholders.
5. `/etc/hosts` needs `127.0.0.1 sugarcane.local` (sudo). Until then use `sugarcane.localhost` for the React dev server.
6. Push to GitHub needs your credentials once (the cached HTTPS credential had expired).
7. All cane roles can read the masters (growers, circles, villages), so the Home tiles show for every role. Phase 3 can
   narrow this for gate roles if wanted.
8. Urdu: the React shell switches to RTL and Nastaliq by `dir="rtl"`, but no translations are written yet. They come with
   the first grower-facing print formats (Phase 2/3).
9. The built React bundle is committed (`sugarcane/public/frontend`, `www/sugar.html`), so the app works without a Node
   build after `bench get-app`. Run `npm run build` in `frontend/` after UI changes.
10. `frappe.tests.UnitTestCase` / `IntegrationTestCase` are used: v16 deprecates `FrappeTestCase`.
