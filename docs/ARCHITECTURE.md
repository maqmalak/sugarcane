# MicroMax Sugar Mills Ltd. — Sugar ERP Architecture (Phase 0, for approval)

App `sugarcane` · site `sugarcane` · Frappe 16.34 / ERPNext 16.35 / HRMS · Python 3.14 · Node 24 · MariaDB
Status: **approved 2026-10-13** (v3: decisions below). Phases 0–4 and ELP are built; see `docs/PHASE_0.md` … `PHASE_4.md`, `ELP.md`.

### Decisions (2026-10-13)

| # | Decision |
|---|---|
| Site | **`sugarcane.local`** (bench refuses a site named like an app); desk `http://sugarcane.local:8006`, React dev `:5179` |
| TPT | Per maund of payable weight |
| Binding | **0.265 kg per quintal** of net weight (season value, overridable per vehicle type); garbage % / fixed kg configurable, 0 by default |
| Bank payment | The accountant scans CPR barcodes into one scroll: many CPRs, many growers (Phase 6) |
| Road cess | Deposited **100% monthly**; **grower bears 50%** (deducted on the CPR), **mill bears 50%** (expense) |
| Cost of sales | Separate ledgers: **Cane Purchase A/c (Govt)**, **Subsidy Purchase**, **Additional Subsidy** (plus Road Cess – Mill Share) |
| Crushing day | **07:00 → 07:00** |
| Withholding tax | **None** on cane purchase |
| Grower ID | **circle code − village code − serial**, e.g. `001-001-0001` |
| Android | Source in `android/`; the Android SDK is installed in the user's home when Phase 1 needs a build |
| Git | `main` on github.com/maqmalak/sugarcane |
| Maps (Phase 1) | **MapLibre GL** with ESRI World Imagery / OSM, reusing the real-estate app's map code (`LocationCapture`), instead of Leaflet; Android uses **osmdroid** with the same imagery |
| Hierarchy geo (Phase 1) | Every level — Division, District, Zone, Circle, Sector, Village — has a **pin** (lat/lng), a **boundary** (Geolocation) and a computed **area**; edited on the desk or in React → Area Map |
| UI style | The React app uses the real-estate app's global CSS and UI kit (`.field` inputs, `.form-card`, cards, sheets, tabs) |

---

## 0. Environment: spec vs. this machine

| Spec | Actual | Proposal |
|---|---|---|
| Bench `~/frappe-bench` | Not present. The bench is `/home/maqmalak/erpnext-react` (shared with micromaxerp, wise, muzzamal, realestate; Frappe v16, Py 3.14, Node 24, HRMS available) | Use this bench. No other site's config is touched. |
| Site `sugarcane` at `http://sugarcane:8006` | bench refuses a site with an app's name | Site **`sugarcane.local`**, `host_name http://sugarcane.local:8006`, Procfile `web_sugarcane`. Needs `127.0.0.1 sugarcane.local` in `/etc/hosts` (sudo); until then the React dev server uses `sugarcane.localhost`. |
| `frappe_whatsapp` | The bench's WhatsApp app is `whatsapp` (Meta Cloud API) | Install `whatsapp`; mock mode until a real account exists. |
| React dev on `:8080` | `:8080` is used by Docker `erpnext-frontend-1` | Dev server on **`:5179`** (your choice), proxy → `:8006`; the build is served at `/sugar`. |
| Git `github.com/maqmalak/sugarcane.git` | Repo exists | Branch **`main`** (your instruction). Push needs your GitHub credentials once (credential cache). |
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
net_kg             = gross_kg − tare_kg
binding_kg         = net_kg / 100 × binding_kg_per_quintal            (0.265; whole kg)
garbage_kg         = net_kg × garbage_pct / 100 + garbage_fixed_kg     (whole kg)
payable_kg         = net_kg − binding_kg − garbage_kg
payable_maund      = payable_kg / 40                                   (3 decimals, display)
govt_value         = payable_kg × govt_rate / 40
road_cess_total    = govt_value × road_cess_pct / 100                  (deposited 100%)
road_cess_grower   = road_cess_total × grower_cess_share_pct / 100     (50%)
road_cess_mill     = road_cess_total − road_cess_grower
subsidy            = payable_kg × subsidy_rate / 40
additional_subsidy = payable_kg × additional_subsidy_rate / 40
net_amount         = govt_value − road_cess_grower + subsidy + additional_subsidy
tpt_amount         = payable_kg × tpt_rate / 40                        (per maund)
loan_deduction     = min(requested, net_amount − tpt_amount)           (Phase 6)
payable_cpr        = net_amount − tpt_amount − loan_deduction
```

Amounts are computed from kg (not the rounded maunds) and each is rounded to paisa (half up) before the next step, so the
printed slip adds up. Worked example (tested): gross 18,450, tare 4,250 → net 14,200, binding 38, payable 14,162 kg
(354.050 md); govt value 150,471.25; cess 1,504.71 (grower 752.36, mill 752.35); subsidy 3,540.50; additional 1,770.25;
net 155,029.64; TPT 10,621.50; payable 144,408.14.

### 4.2 Accounts (created per company by `sugarcane.setup.accounts`, linked in Sugar Settings)

| Account (MSML) | Parent / type | Why |
|---|---|---|
| Grower Payable | Accounts Payable, **Payable** | party_type Grower |
| Cane Purchase Clearing | Accounts Payable, **Payable** | `credit_to` of the daily PI; CPR JE rows carry party Supplier "Daily Cane Purchase" |
| TPT-Bilty Payable | Current Liabilities | drivers aren't parties; the Bilty document is the sub-ledger |
| Road Cess Payable - Govt | Duties and Taxes, Tax | 100% of cess until the monthly deposit |
| Grower Loan Receivable | Loans and Advances (Assets), Receivable | Phase 6 |
| Cash Counter - Cane | Cash In Hand, Cash | the mill cash counter (bilties) |
| **Cane Cost of Sales** (group) → Cane Purchase A-c (Govt), Subsidy Purchase, Additional Subsidy, Road Cess - Mill Share | Direct Expenses | the separate cost-of-sales ledgers |
| Cane Yard warehouse; item SUGARCANE (stock UOM Kg, UOM Maund = 40 kg) | Stock | perpetual inventory |

"/" isn't used in account names (it breaks desk URLs): "TPT/Bilty" is "TPT-Bilty" and "A/c" is "A-c".

### 4.3 Documents → vouchers

| Document | When | Voucher | Entry |
|---|---|---|---|
| **CPR** (S) | submit (after tare; Cane Admin only for cancel) | **Journal Entry** | Dr Cane Purchase Clearing *(party Supplier "Daily Cane Purchase")* govt_value · Dr Subsidy Purchase subsidy · Dr Additional Subsidy additional_subsidy · Dr Road Cess – Mill Share road_cess_mill · Cr Road Cess Payable – Govt road_cess_total · Cr TPT-Bilty Payable tpt · Cr Grower Payable *(party Grower)* payable_cpr · (Phase 6: Cr Grower Loan Receivable loan_deduction) |
| **TPT Bilty** (S) | auto-created (submitted) with the CPR; paid at the counter | **Journal Entry** on "Pay" | Dr TPT/Bilty Payable · Cr Cash Counter – Cane. Slip: driver name, CNIC, vehicle no., CPR no., amount |
| **Road Cess Deposit** (S) | periodic | **Journal Entry** (or Payment Entry to the govt) | Dr Road Cess Payable · Cr Bank. Holds challan no., period and the CPRs covered (each CPR marked deposited) |
| **Cane Payment Scroll (Bank)** (S) | batch of unpaid submitted CPRs | **Payment Entry per grower** (default, Q3) | Dr Grower Payable (party Grower) · Cr Bank, allocated against the CPR JEs. Marks CPRs paid; exports the bank file |
| **Daily Cane Purchase Invoice** | day close (scheduler) or manual | **Purchase Invoice**, `update_stock = 1` | Supplier "Daily Cane Purchase", `credit_to` Cane Purchase Clearing, item Sugarcane (stock UOM kg), qty = day's payable_kg, amount = day's govt_value, warehouse Cane Yard. Dr Stock · Cr Clearing |

**Closing the clearing loop.** CPR JEs debit the clearing account against the internal supplier during the day. The
daily PI credits it. Right after the PI is submitted, the day's CPR JE rows are **reconciled against the PI** (ERPNext's
payment reconciliation API). That brings the PI's outstanding to 0 and the clearing balance to 0, with no open advances.
Day boundary = **crushing day 07:00 → 07:00** (Sugar Settings → crushing_day_start_hour). A CPR cancelled after its day's PI
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
Indent Range · Cane Indent (S: Draft → Authorized → Printed → Used/Expired/Cancelled) · Indent Quota Rule ·
Indent Batch (S; authorizing the batch authorizes its indents) · generation from the React *Generate* screen (built: see `PHASE_2.md`).

### Phase 3 — Procurement / Weighbridge
*As built (see `PHASE_3.md`):*
- No separate Seasonal Rate Setup: rates resolve from the existing season, circle, source (TPT by vehicle type) and vehicle-type fields.
- The yard is a live board instead of In-Gate Pass / Yard Balance Log documents.
- Misc Weighment and Contractor Allotment / Cane Officer Quota / Source Target are not built yet.

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
*As built (see `PHASE_4.md`):*
- Depot purchases use the Phase 3 token / Cane Weighment / CPR, with a purchase depot and the depot's terminal, rather than a separate Depot Weighment.
- **Depot Dispatch** carries the cane to the mill: transit shortage, freight and recovery post at day close.
- LP Vehicle Registration is the ELP module (`ELP.md`).

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
`useFrappePostCall`, `useFrappeEventListener`), Tailwind + the real-estate UI kit, Recharts, MapLibre GL, TanStack Table. Build →
`sugarcane/public/frontend` + `www/sugar.html`; `website_route_rules` maps `/sugar/<path>` to it. Dev server :5179 (§0).
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

Site + app + git (`main`). Sugar Settings / Season / Shift; area, source, LP, depot, variety, disease, vehicle
masters; **Grower + Party Type + Passbook + Import**; account setup (§4.2); Weighbridge Terminal; roles + User Permission
scoping; fixtures; demo masters (MicroMax Sugar Mills Ltd., ~3 zones, ~12 circles, ~150 villages, ~500 growers, flagged
`is_demo`); React shell at `/sugar`. Tests: CNIC, unit conversions, rate resolution, **CPR formula (pure function, ahead of
Phase 3)**, Grower JE/PE posting. Then `docs/PHASE_0.md`, push, stop.

---

## 11. Open questions

Answered 2026-10-13 (see Decisions at the top). Still open: weighbridge indicator / camera / lab instrument models (Phase 3/5),
bank file formats (Phase 6, send samples), data to migrate (growers, passbooks, opening balances, loans), the road cess
challan format, and how **Cane Purchase A/c (Govt)** should be used — see `docs/PHASE_0.md` → Known gaps.
