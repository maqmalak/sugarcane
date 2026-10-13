# MicroMax Sugar Mills Ltd. — Sugar ERP Architecture (Phase 0, for approval)

App `sugarcane` · site `sugarcane` · Frappe 16.34 / ERPNext 16.35 / HRMS · Python 3.14 · Node 24 · MariaDB
Status: **draft v2 (revised spec: Grower party type, JE-based CPR, Bilty, Road Cess Deposit, daily Purchase Invoice,
Sugar Production). Waiting for approval.** No code yet. This file moves to `apps/sugarcane/docs/ARCHITECTURE.md` and is the
first commit on `develop`.

---

## 0. Environment: spec vs. this machine

| Spec | Actual | Proposal |
|---|---|---|
| Bench `~/frappe-bench` | Not present. The bench is `/home/maqmalak/erpnext-react` (shared with micromaxerp, wise, muzzamal, realestate; Frappe v16, Py 3.14, Node 24, HRMS available) | Use this bench. No other site's config is touched. |
| Site `sugarcane` at `http://sugarcane:8006` | Site doesn't exist; hostname `sugarcane` doesn't resolve | Create site `sugarcane`, `host_name http://sugarcane:8006`, Procfile `web_sugarcane: bench --site sugarcane serve --port 8006`. Needs one line in `/etc/hosts`: `127.0.0.1 sugarcane` (sudo, so you add it, or I fall back to `sugarcane.localhost`). The separate hostname also keeps its login cookie apart from the other sites. |
| `frappe_whatsapp` | The bench's WhatsApp app is `whatsapp` (Meta Cloud API) | Install `whatsapp`; mock mode until a real account exists. |
| React dev on `:8080` | **`:8080` is in use** by a Docker container `erpnext-frontend-1` (nginx) | Dev server on **`:8081`** (proxy → `:8006`) unless you want that container stopped. The build is served at `/sugar` either way. |
| Git `github.com/maqmalak/sugarcane.git`, branch `develop` | The repo exists and is empty. Push goes over HTTPS with the cached credential helper, as for your other apps | `git init` in `apps/sugarcane`, create `develop`, push. If push asks for credentials, I'll stop and tell you. |
| `pyproj`, `shapely` | Not installed | Declared in `pyproject.toml`; `bench setup requirements`. |
| Android | Java present, no Android SDK / Gradle | Write the source; APKs need the SDK (Q12). |
| Scheduler | `bench schedule` runs jobs for **every** site (micromaxerp has real MEPL data) | Not started without asking; sugarcane jobs run individually during development. |

---

## 1. Design rules

1. **Cane never touches ERPNext Buying per grower.** No Supplier / PO / PR / per-grower PI for cane. Token → Weighment →
   CPR → Bilty → Scroll live in `sugarcane`. The only Buying document is the **one Daily Cane Purchase Invoice** that brings
   cane into stock.
2. **Grower is a Party Type.** JE / PE / GL / Payment Ledger work against Growers natively.
3. **Money only through vouchers:** Journal Entry, Payment Entry, Purchase Invoice, Stock Entry. Never `GL Entry` inserts.
4. **Season-driven:** rates, cess %, subsidy, TPT, binding/garbage rules, ranges, targets, markups → `Crushing Season`.
5. **Calculations are pure functions** in `sugarcane/calc/` (CPR formula, rate resolution, area/overlap, loan markup,
   recovery, costing), unit-tested without the DB. Controllers gather inputs and store results.
6. **Fixtures + patches**: fresh `install-app sugarcane` + `migrate` = working system (accounts created by an idempotent
   setup step, since accounts are company-specific and can't be plain fixtures).

---

## 2. Module map

| Module | Purpose | Phase |
|---|---|---|
| Sugarcane | Settings, season, shift, area/source/variety/vehicle masters, **Grower**, passbook, terminals | 0 |
| EagleEye Survey | Surveys, overlap review, surveyor attendance/tracking/targets/devices | 1 |
| Cane Indenting | Indent ranges, indents, print authorization | 2 |
| Cane Procurement | Seasonal rates, tokens, gate pass, yard, **CPR**, **TPT Bilty**, **Daily Cane Purchase** | 3 |
| Weighbridge | Terminals' readings, Cane Weighment, misc weighment, snapshots | 3 |
| Vehicle Tracking | LP/depot vehicle registration, gate acceptance | 4 |
| Depot Purchase | Depot weighments and bills (→ CPR) | 4 |
| Cane Laboratory | Hourly samples, Daily Manufacturing Report, recovery approvals, stoppages | 5 |
| Sugar Production | 50 kg bag BOM setup, **Daily Production Entry** → Work Order + Stock Entry (Manufacture) | 5 |
| Cane Accounting | **Cane Payment Scroll (Bank)**, **Road Cess Deposit**, grower reports | 6 |
| Grower Loans | Loan types, loans, guarantors, recovery at CPR | 6 |
| Cane Costing | Cane cost and cost of production | 6 |
| SMS Integration | Templates, alerts, request-by-SMS | 8 |
| Sugar MIS | Plant levels, MIS APIs, dashboards | 5 / 8 |

Shared code: `sugarcane/calc/`, `sugarcane/api/v1/`, `sugarcane/erp/` (voucher builders), `sugarcane/permissions.py`,
`sugarcane/setup/` (install, accounts, roles, demo), `sugarcane/tests/`.

---

## 3. Grower as an ERPNext Party Type

ERPNext resolves a party's account through `get_party_account()`, which for any party type other than Customer/Supplier
reads the **`Party Account`** child table (`parenttype = <party type>`). So:

- **Grower** DocType: naming `GRW-.#####` (or passbook no., Q11), `title_field = grower_name`,
  `search_fields = cnic, passbook_no, village`. Fields: grower_name, father_name, **cnic** (validated `#####-#######-#`,
  unique), passbook_no, circle, sector (fetched), village, mobile, bank_name, branch, account_no, iban, filer_status,
  is_active, disabled, **accounts** (Table → `Party Account`: company + account). On insert the accounts row is filled
  from Sugar Settings → Grower Payable, so every grower always resolves to the right ledger.
- **Party Type fixture:** `{party_type: "Grower", account_type: "Payable"}`.
- Grower bank details also create an ERPNext **Bank Account** (`party_type = Grower`). The bank scroll export uses it.
- **Grower Passbook**: grower, passbook_no, circle, village, issue season, status, land holdings (T: murabba, killa, acres, kanal).
- **Grower Import** (Excel/CSV, background job): CNIC format + uniqueness, circle/village names, duplicate passbooks; an
  error sheet comes back; Grower + Passbook + Bank Account are created in batches.

Tests: a Payment Entry and a Journal Entry against a Grower post, and the party balance is correct.

---

## 4. CPR formula and accounting (authoritative rules, as implemented)

### 4.1 Formula (`sugarcane/calc/cpr.py`, pure function)

```
net_kg          = gross_kg − tare_kg
binding_kg      = rule(season, vehicle_type): fixed kg and/or % of net_kg
garbage_kg      = rule(season, vehicle_type): fixed kg and/or % of net_kg
payable_kg      = net_kg − binding_kg − garbage_kg
payable_maund   = payable_kg / 40                                 (maund_kg in Sugar Settings)
govt_value      = payable_maund × govt_rate_per_maund
road_cess       = govt_value × road_cess_pct / 100
subsidy         = payable_maund × subsidy_rate
net_amount      = govt_value − road_cess + subsidy
tpt_amount      = tpt_rate × payable_maund   OR   per-trip rate   (rate setup's tpt_basis; per kg also supported)
loan_deduction  = Phase 6, capped at what's left
payable_cpr     = net_amount − tpt_amount − loan_deduction
```

Every line is a stored, read-only field on the CPR. Rounding: weights in whole kg; maunds to 3 decimals; each amount
rounded to 2 decimals (PKR) **before** the next step, so the printed slip adds up exactly. Validation: payable_kg > 0,
payable_cpr ≥ 0 (otherwise TPT/loan is capped and the shortfall flagged).

### 4.2 Accounts (created per company by `sugarcane.setup.accounts`, linked in Sugar Settings)

| Account | Parent / type | Why |
|---|---|---|
| Grower Payable | Current Liabilities, **Payable** | party_type Grower |
| Cane Purchase Clearing | Current Liabilities, **Payable** | it must be a payable to be the `credit_to` of the daily PI; JE rows on it carry party Supplier "Daily Cane Purchase" |
| Road Cess Payable – Govt | Duties and Taxes, Tax | no party needed |
| TPT/Bilty Payable | Current Liabilities (no account type) | drivers aren't parties; the Bilty document is the sub-ledger |
| Cane Subsidy Expense | Direct Expenses | |
| Cash Counter – Cane | Cash In Hand, Cash | the mill cash counter |
| Cane Yard warehouse + its stock account | Stock Assets | perpetual inventory |

### 4.3 Documents → vouchers

| Document | When | Voucher | Entry |
|---|---|---|---|
| **CPR** (S) | submit (after tare; Cane Admin only for cancel) | **Journal Entry** | Dr Cane Purchase Clearing *(party Supplier "Daily Cane Purchase")* govt_value · Dr Cane Subsidy Expense subsidy · Cr Road Cess Payable road_cess · Cr TPT/Bilty Payable tpt · Cr Grower Payable *(party Grower)* payable_cpr · (Phase 6: Cr Grower Loan Receivable loan_deduction) |
| **TPT Bilty** (S) | auto-created (submitted) with the CPR; paid at the counter | **Journal Entry** on "Pay" | Dr TPT/Bilty Payable · Cr Cash Counter – Cane. Slip: driver name, CNIC, vehicle no., CPR no., amount |
| **Road Cess Deposit** (S) | periodic | **Journal Entry** (or Payment Entry to the govt) | Dr Road Cess Payable · Cr Bank. Holds challan no., period and the CPRs covered (each CPR marked deposited) |
| **Cane Payment Scroll (Bank)** (S) | batch of unpaid submitted CPRs | **Payment Entry per grower** (default, Q3) | Dr Grower Payable (party Grower) · Cr Bank, allocated against the CPR JEs. Marks CPRs paid; exports the bank file |
| **Daily Cane Purchase Invoice** | day close (scheduler) or manual | **Purchase Invoice**, `update_stock = 1` | Supplier "Daily Cane Purchase", `credit_to` Cane Purchase Clearing, item Sugarcane (stock UOM kg), qty = day's payable_kg, amount = day's govt_value, warehouse Cane Yard. Dr Stock · Cr Clearing |

**Closing the clearing loop.** CPR JEs debit the clearing account against the internal supplier during the day. The
daily PI credits it. Right after the PI is submitted, the day's CPR JE rows are **reconciled against the PI** (ERPNext's
payment reconciliation API). That brings the PI's outstanding to 0 and the clearing balance to 0, with no open advances.
Day boundary = **crushing day** (configurable start hour, e.g. 06:00–06:00, Q8). A CPR cancelled after its day's PI
needs an adjustment (a debit note on the daily PI, created automatically).

**Daily checks** (report "Cane Day Close", also a test): Clearing = 0; Road Cess Payable = cess on CPRs not yet
deposited; TPT/Bilty Payable = unpaid bilties; Grower Payable = Σ unpaid payable_cpr.

### 4.4 Grower reports (Script Reports on the Payment Ledger / GL with `party_type = Grower`)
Grower Ledger (date-wise CPRs, payments, loan deductions, running balance), Grower Payable Aging (0–7, 8–15, 16–30,
31–60, 60+; circle/village/source filters), Grower Trial Balance, CPR Paid/Unpaid, Bilty Paid/Unpaid, Road Cess
Deducted vs Deposited, Cane Day Close. Each ties to the Grower Payable account balance (tested).

---

## 5. Production (Sugar Production module)

- **Setup** (`sugarcane.setup.production`): items Sugar 50 kg Bag (FG), Sugarcane (RM, kg), packing bag (RM), Molasses,
  Bagasse, Press Mud (scrap, kg). **BOM per 1 bag**: cane kg = 50 / standard recovery % × 100 (e.g. 10% → 500 kg),
  1 packing bag. Scrap items molasses/bagasse/mud with qty per bag and **NRV rate** (season-wise in Sugar Settings / Crushing Season).
- **Daily Production Entry** (S): date, shift summary, cane_crushed_kg (= Σ submitted CPR payable_kg for the crushing day,
  pulled automatically), bags_produced (from the DMR), molasses/bagasse/mud actual kg (from the DMR), recovery_pct =
  sugar kg ÷ cane kg × 100. On submit:
  1. Create and submit a **Work Order** for `bags_produced` against the bag BOM.
  2. Create a **Stock Entry (Manufacture)** against it, with cane consumed set to the actual crushed kg (not the BOM
     standard), FG = bags produced, and scrap rows = DMR actuals valued at NRV. The FG cost is what's left.
- Order of operations: the daily cane PI must exist before the production entry (it checks and refuses otherwise).

---

## 6. DocTypes by phase

Legend: **S** submittable, **W** workflow, **T** child table, **1** single. Transactions: `track_changes = 1`, `season`, `company`.

### Phase 0 — Sugarcane
| DocType | Key fields |
|---|---|
| Sugar Settings (1) | company, active_season, maund_kg (40), crushing_day_start_hour, overlap_tolerance_pct, geofence_radius_m, tracking_interval_s, accounts (§4.2), cane item, cane yard warehouse, internal supplier, weighbridge_ip_check |
| Crushing Season | season_name, company, dates, status (Planned/Open/Closed), crushing target, default govt rate, standard recovery %, NRV rates |
| Crushing Shift | name (A/B/C), start/end time |
| Sugar Division → Sugar District → Sugar Zone (is_free_area) → Cane Circle → Cane Sector → Cane Village | parent links; Circle: distance, incentive, subsidy, deduction rate, affiliation, quality, quota, polygon, circle officer; Village: distance, incentive, subsidy, TPT subsidy, TPT deduction |
| Cane Source | type (Factory Gate / Check Post / Depot), market committee, road cess override, TPT rates by vehicle type (T) |
| Loading Point / Cane Depot | source, GPS, geofence polygon, contractor → Supplier ("Cane Contractor"), rate, target |
| Cane Variety / Crop Disease | code, type, ratoon flag, expected yield / severity |
| Grower / Grower Passbook / Grower Import | §3 |
| Vehicle Type | min/max gross, min/max tare, lane, default binding & garbage rule |
| Sugar Vehicle / Vehicle Lane | registration_no (unique), type, owner, driver (name, CNIC, mobile), blacklisted · lane, gate. ("Sugar Vehicle" so it doesn't clash with ERPNext `Vehicle`.) |
| Weighbridge Terminal | ip, device id, bridge no., allowed ops, API user, camera URLs, LCD port |

### Phase 1 — EagleEye Survey
Cane Survey (S: uuid, grower, passbook, circle, village, murabba, killa, acres, empty/crop land, variety, plant/ratoon,
disease %, polygon, calc area, photos T, device, GPS accuracy, overlap status) · Survey Overlap Review · Surveyor
Attendance (S) · Surveyor Location Log · Surveyor Target · Survey Device.

### Phase 2 — Cane Indenting
Indent Range · Cane Indent (S, W: Draft → Authorized → Printed → Used/Expired/Cancelled) · Indent Quota Rule ·
Indent Generation Tool (enqueued).

### Phase 3 — Procurement / Weighbridge
| DocType | Key fields |
|---|---|
| Seasonal Rate Setup | season, level (Season / Circle / Source / Loading Point) + link, govt_rate, road_cess_pct, subsidy_rate, tpt_basis (per maund / per kg / per trip) + rates by vehicle type (T), binding rule, garbage rule (fixed kg / % of net / both, by vehicle type T). Most specific level wins |
| Cane Token (S) | token_no, barcode, indent, grower, vehicle, driver, source, loading point, **rates copied at issue**, status, duplicate-vehicle flag |
| In-Gate Pass (S) / Yard Balance Log | token, gate time, yard inner/outer, position · hourly snapshot |
| Cane Weighment (S) | token, gross kg/time/user/terminal/snapshot, unloading (tipper), tare kg/time/user/terminal/snapshot, net |
| Weighment Reading Log | insert-only: terminal, user, ip, raw, stable, time |
| **Cane Purchase Receipt (CPR)** (S) | cpr_no, barcode, token, weighment, grower, circle, village, source, all §4.1 fields, journal_entry, bilty, daily_purchase_invoice, paid status, payment scroll, cess deposited flag |
| **TPT Bilty** (S) | bilty_no, CPR, vehicle, driver name/CNIC, tpt basis/rate/amount, status (Unpaid/Paid), paid at/by, counter JE |
| **Daily Cane Purchase** (S) | crushing day, CPRs (T), totals, purchase_invoice, reconciliation status |
| Contractor Allotment / Cane Officer Quota / Source Target | season targets and rates |
| Misc Weighment (S) | item, in/out, party, gross/tare/net → Stock Entry / Delivery Note / Purchase Receipt (draft) |

### Phase 4 — Vehicle Tracking & Depot
LP Vehicle Registration (S: uuid, LP/depot, photos, GPS, in-geofence, blur score, gate status, token) · Depot Weighment
(S) → Depot CPR through the same §4 path.

### Phase 5 — Laboratory & Production
Lab Sample (S: type, hour, shift, pol, brix, purity, moisture…) · Daily Manufacturing Report (S, W: Prepared → Approved) ·
Mill Stoppage Log · Vehicle Recovery Sample · Plant Level Reading · Daily Production Entry (S, §5).

### Phase 6 — Accounting, Loans, Costing
Cane Payment Scroll (Bank) (S) · Road Cess Deposit (S) · Grower Loan Type · Grower Loan (S, W; disbursement by Payment
Entry Dr Grower Loan Receivable, party Grower) · Loan Recovery Entry (from CPR) · markup Journal Entry (scheduler) ·
Cane Costing reports.

### Phase 8 — Messaging & MIS
Sugar SMS Template · Sugar SMS Log · SMS Keyword; MIS API + realtime events.

---

## 7. Cross-cutting

- **Rates:** `calc.rates.resolve(season, circle, source, loading_point, vehicle_type)` (Loading Point → Source → Circle → Season), copied onto the Token. CPR uses the Token's copy.
- **Geo:** GeoJSON in Geolocation fields; `pyproj.Geod(ellps="WGS84")` area; `shapely` overlap with an indexed bbox prefilter.
- **Weighbridge security:** agent API key bound to a Weighbridge Terminal, `request_ip` must match, operators accept the
  agent's stable reading only (no typed weights), every reading logged, Vehicle Type limits checked on the server.
- **Permissions:** DocPerms + User Permissions on Company, Cane Circle, Cane Source, Cane Depot (Grower inherits circle
  scoping). Roles: Cane Manager, Cane Admin, Circle Officer, Surveyor, Indent Clerk, Token Clerk, Gross Weighman, Tare
  Weighman, Yard Supervisor, **Cane Cashier** (Bilty counter), Lab Chemist, Production Manager, Cane Accountant, Depot
  User, MIS Viewer.
- **Jobs / realtime:** enqueue imports, bulk indent printing, scroll → Payment Entries, daily PI + reconciliation, SMS.
  Events `sc_yard_update`, `sc_weighment`, `sc_bilty`, `sc_plant_level`, `sc_mis_tick`.
- **Hardware agent** `sugarcane_agent/`: pluggable indicator parsers (serial/TCP), stable-weight detection, RTSP/HTTP
  snapshots, LCD driver, lab instrument parsers, SQLite offline queue, systemd/Windows service, plus a simulator for dev.
- **Android sync:** delta masters by `modified`; batch upload keyed on client `uuid` (unique), device binding, token auth.
- **Localization:** English UI; `translations/ur.csv`; React i18n with RTL + Noto Nastaliq; PKR, Asia/Karachi.

---

## 8. React (`apps/sugarcane/frontend`)

React 18 + TS + Vite + **frappe-react-sdk** (`FrappeProvider`, `useFrappeAuth`, `useFrappeGetDocList`, `useFrappeGetCall`,
`useFrappePostCall`, `useFrappeEventListener`), Tailwind + shadcn/ui, Recharts, Leaflet, TanStack Table. Build →
`sugarcane/public/frontend` + `www/sugar.html`; `website_route_rules` maps `/sugar/<path>` to it. Dev server :8081 (§0).
Shell (login, layout, theme, role-aware menu) adapted from the realestate frontend, written against frappe-react-sdk.

```
src/app (routes, providers, nav by role) · src/lib (api, realtime, units kg/maund, money, i18n/rtl)
src/components (shell, data-table, map layers, charts, barcode, camera-compare, slip print)
src/pages: home · survey (map, dashboard) · indent · token · yard (board) · weighbridge (gross, tare)
           · cpr (view/search) · bilty (cash counter: search CPR/vehicle → pay → print slip) · payments (scroll)
           · lab (hourly) · production · mis
```

## 9. Android (`apps/sugarcane/android/`)
`eagleeye/`, `vehicle-tracking/`, `depot-purchase/` + shared `core` module (auth, device binding, UUID outbox sync,
geofence, camera with Laplacian blur check, GPS accuracy gate; ESC/POS Bluetooth printing for depot). Kotlin, Compose,
Room, WorkManager.

---

## 10. Phase 0 deliverables (once approved)

Site + app + git (`develop`, pushed). Sugar Settings / Season / Shift; area, source, LP, depot, variety, disease, vehicle
masters; **Grower + Party Type + Passbook + Import**; account setup (§4.2); Weighbridge Terminal; roles + User Permission
scoping; fixtures; demo masters (MicroMax Sugar Mills Ltd., ~3 zones, ~12 circles, ~150 villages, ~500 growers, flagged
`is_demo`); React shell at `/sugar`. Tests: CNIC, unit conversions, rate resolution, **CPR formula (pure function, ahead of
Phase 3)**, Grower JE/PE posting. Then `docs/PHASE_0.md`, push, stop.

---

## 11. Open questions (default used if you don't decide)

| # | Question | Default |
|---|---|---|
| 1 | TPT: per maund/kg of payable weight, or fixed per trip by distance/vehicle type? | Both supported per rate setup (`tpt_basis`); demo uses **per maund** |
| 2 | Binding / garbage: fixed kg, % of net, or both? By vehicle type? | Both, per vehicle type: e.g. binding fixed kg (trolley 40, truck 80), garbage % of net (e.g. 2%) |
| 3 | Bank scroll: PE per grower or one JE per scroll? Bank file format? | **One Payment Entry per grower** (clean ledgers, cheque/IBAN per grower); CSV/XLSX export with IBAN, CNIC, amount; specific bank formats when you send samples |
| 4 | Road cess deposit frequency, challan format | Monthly; challan no., date, bank, period, CPRs covered |
| 5 | Daily PI value: govt rate value only, or + subsidy? | **Govt rate value only** (subsidy stays an expense). If you want cane at full cost, the CPR JE debits clearing with govt_value + subsidy and the PI matches |
| 6 | Weighbridge indicator, camera, lab instrument models | Generic serial ASCII parser + Modbus-TCP stub, RTSP/HTTP snapshot, simulator |
| 7 | Data to migrate (growers, passbooks, opening balances, loans) | Excel templates; opening grower balances by an opening JE (party Grower) |
| 8 | Crushing day boundary for the daily PI and production | 06:00 → 06:00 (configurable) |
| 9 | Withholding tax on grower payments (filer/non-filer)? The new formula has none | None on CPR; `filer_status` stored for reports. If needed, it becomes a CPR line + Cr WHT Payable |
| 10 | `/etc/hosts` entry `127.0.0.1 sugarcane`: will you add it (sudo), or use `sugarcane.localhost`? | You add it; until then I use `sugarcane.localhost:8006` |
| 11 | Grower ID: auto `GRW-#####`, or passbook no.? | Auto ID; passbook no. unique and searchable |
| 12 | Android SDK: install here, or source only? | Source only |
| 13 | React dev port: 8080 is taken by Docker `erpnext-frontend-1`. Use 8081, or stop that container? | 8081 |
