# Phase 7 — ERPNext Standard Modules, Configured for the Mill

Built 2026-10-19. The spec says *configure, don't rebuild*: purchase, stores, payables, the general ledger, cash and tax, sugar sales, receivables, fixed assets and HR / payroll all use ERPNext and HRMS as they are.

This phase adds:
- **the configuration**: `sugarcane/setup/erp_config.py`. It is idempotent and runs on every migrate.
- **custom pieces** where the mill needs more than ERPNext gives:
  - gate passes
  - weighing sugar trucks on the weighbridge
  - Pakistani voucher numbering, batch posting and voucher printing
  - late penalties and biometric punches
  - nine reports
- **four React dashboards**: Purchase & Stores, Sugar Sales, Finance, HR & Payroll. The forms open in the ERPNext desk.

## Configuration (what `configure()` sets up)

| Area | What |
|---|---|
| **Chart of accounts — 5 levels** | ERPNext's standard chart is 4 levels. A control group now sits between the sub-group and its ledgers. Example: *Liabilities › Current Liabilities › Duties and Taxes › Sales Tax › Output Sales Tax (GST)*.<br>New control groups: Cane Growers, Trade Creditors, Sales Tax, Income Tax Withheld, Government Levies, Payroll Liabilities, Statutory Funds, Cane Transport, Grower Loans, Staff Advances, Current Accounts, Cash Counters, Sugar Sales, By-product Sales, Salaries and Benefits, Statutory Charges.<br>The sugar ledgers moved under them; balances stay where they are and all five cane control checks still tie.<br>New ledgers include: Output / Input / Further Sales Tax, WHT 153 goods / services, WHT 149 salaries, WHT 236G-H, EOBI, PESSI, PF, gratuity, WPPF, WWF, sugar and by-product sales. |
| **Cost centres** | Cane, Mill House, Boiler House, Power House, Process House, Laboratory, Workshop, Stores, Sales, Administration. Project types: Mill Overhaul, Plant Expansion, Civil Works. |
| **Item groups — 4 levels** | *All Item Groups › Stores and Spares › Mechanical › Bearings*: 36 leaf groups across products, raw and packing material, stores and spares, chemicals and fuel, tools, services. The sugar items were moved into them. |
| **Stores** | Warehouses: Mechanical, Electrical, Chemical, Fuel, Tools, Scrap Yard.<br>Stock entry types: Store Issue, Store Return, Store Transfer, Tools Issue, Tools Return, Job Issue (BOM), Opening Stock, Consumption Voucher.<br>UOMs: Ton, Maund, Drum, Roll. |
| **Purchase** | Naming series: Purchase Demand PD-, Inquiry INQ-, SQ-, PO- / IPO- (import), GRN-, PI- / IPI- / SPI-.<br>Quality inspection templates: quick lime, sulphur, PP bags, diesel.<br>Supplier groups.<br>A *Category* (Local / Site / Import / Service) on purchase invoices. |
| **Taxes** (confirm the rates with your tax adviser) | Sales: *Pakistan GST 18 %*, *GST 18 % + Further Tax 4 %* (unregistered buyer), *Export – Zero Rated*.<br>Purchase: *Input GST 18 %*.<br>Withholding categories (rates for 2026-27):<br>• 153(1)(a) goods: 5 % company, 5.5 % others<br>• 153(1)(b) services: 9 % / 11 %<br>• 153(1)(c) contracts: 7.5 % |
| **Banks and cheques** | HBL, MCB, UBL, Allied, NBP, Meezan, Alfalah, each with a **Cheque Print Template**. Positions are those of a standard leaf; fine-tune them after a test print. |
| **Sales** | Customer groups: dealer, industrial, agent account, exporter, Government (TCP / USC), by-product buyer.<br>Territories: Punjab, Sindh and KP regions, plus export.<br>Sales partner types: Commission Agent, Broker.<br>**Sugar Rate List**: Rs 7,250 per 50 kg bag, plus molasses, bagasse and press mud.<br>Naming: sales contract SC-, Delivery Order DO-, SI- / EXP- (export). |
| **Fixed assets** | Two finance books, *Accounting* and *Tax*, both written-down value. Categories with accounting / tax rates: Plant and Machinery 10 / 15 %, Buildings 5 / 10 %, Vehicles 20 / 15 %, Computers 30 / 30 %, Furniture 10 / 15 %. |
| **HR** (HRMS) | Departments and 19 mill designations; a **Seasonal** employment type.<br>Holiday list 2026-27, assigned to the company.<br>Shifts A (06–14), B (14–22), C (22–06) and General, with auto attendance and 10-minute late / early grace.<br>Leaves (Factories Act): casual 10, sick 8, annual 14 (encashable, carried forward), CPL, leave without pay.<br>Salary components: basic, house rent, medical, conveyance, seasonal allowance, overtime, production bonus; EOBI, PF, group insurance, late penalty and income tax deductions; EOBI and PESSI employer shares.<br>Salary structure *Mill Staff – Monthly*: basic 60 %, house rent 27 %, medical 6 %, conveyance 7 %; EOBI 1 % of the minimum wage; PF 8.33 % of basic.<br>**Income tax slab TY2026** (Finance Act 2025, salaried) and a payroll period Jul 2026 – Jun 2027.<br>**Gratuity rule**: 30 days' basic per year of service. |

## Custom pieces

### Gate pass (`/purchase/d/gate-pass`)
- **Pass types:**
  - **Outward – Returnable**: repair or machining. It needs the date the items should be back.
  - **Outward – Non-Returnable**: scrap, rejected material.
  - **Sales Dispatch**: made automatically from a weighed Delivery Order.
- **When it leaves:** submitting records who checked it out and when. A non-returnable pass closes at once.
- **Returns:** recorded item by item; the status goes *Partly Returned*, then *Returned*. More back than went out is refused.
- **Report:** *Gate Pass Outstanding* lists items still outside, with the days overdue.

### Sugar dispatch weighment (Sugar Sales → dispatch board)
1. **At the gate.** The buyer's truck is weighed empty against its Delivery Order (an ERPNext Delivery Note, kept in draft). The expected weight is bags × the season's bag weight (50 kg) + packing (0.1 kg a bag, a setting).
2. **Loading.** The bags are loaded, and the truck is weighed loaded.
3. **The check.** If net and expected agree within **±0.5 %** (a setting):
   - the Delivery Order is submitted (stock leaves the godown)
   - a **sales-dispatch gate pass** is made

   Outside the tolerance it is refused, unless a Sales Manager / Cane Admin accepts it with a note.
- Weights come from the weighbridge agent, as cane weights do (stable, fresh, logged). A Cane Admin can type one in with a note.
- **Report:** *Sugar Dispatch Register*: each Delivery Order with its bags, net / expected kg, difference, gate pass and billing.

### Vouchers (Finance)
- **Numbering:** every journal is a **JV, BPV, BRV, CPV or CRV**, read from its accounts (bank or cash, paid or received). Each type has its own series, e.g. BPV-26-00012. Opening entries stay JV. The type shows as *Voucher* on the journal and in the list.
- **Batch posting:** tick draft journals and payment entries, then post them together. Each is checked on its own, and the failures are listed with the reason.
- **Multi-voucher printing:** one PDF, one voucher a page, on the letterhead. Each page has the accounts, party / cost centre, debit / credit, amount in words, narration and *Prepared / Checked / Approved / Received* boxes.
- **Copy and reverse:** ERPNext's *Duplicate* and *Reverse Journal Entry*.

### HR
- **Biometric punches:** devices (fingerprint, RFID, face) or their middleware post to `POST /api/method/sugarcane.mill_hr.hr.punch`:
  - fields: token, device_id, user_id (the employee's Attendance Device ID), timestamp, log_type
  - auth: the shared token in Sugar Settings
  - each punch becomes an **Employee Checkin**; duplicates are ignored
  - HRMS then marks attendance from the shifts.
- **Late-coming penalty:** every **3 late marks** in a month (a setting) = one day's pay (base ÷ 30). It is made once a month as an *Additional Salary* deduction. Use the button on the HR page or the *Late Coming Register*.
- **Standard HRMS covers the rest:** overtime, CPL (compensatory leave request), leave encashment, gratuity, Full and Final Statement, salary register.

## Reports (Report Centre)

| Group | Report | What |
|---|---|---|
| Purchase & Stores | **Comparative Statement** | Supplier quotations side by side per item: each supplier's rate, the lowest, the spread %, the last PO rate. Total at lowest. |
| | **Gate Pass Outstanding** | Returnable items still out, with days overdue |
| Sugar Sales | **Sugar Dispatch Register** | Delivery Orders lifted with weighment, gate pass and billing |
| Finance | **Payables Projection** | By week for 8 weeks (plus overdue and later): unpaid bills by due date, plus goods received but not invoiced |
| | **Post Dated Cheques** | Cheques issued or received whose date is after the entry date, and not cleared |
| | **Earnings Per Share** | Profit after tax ÷ shares outstanding (Sugar Settings), by month |
| | **WPPF and WWF** | 5 % of profit before tax; WWF 2 % of profit after WPPF (rates are settings) |
| | **Voucher Register** | Journals by voucher type, posted and draft |
| HR & Payroll | **Late Coming Register** | Late marks per employee for a month, days to deduct, penalty made |

ERPNext's own reports are linked from each page: Accounts Payable / Receivable, General Ledger, Trial Balance, Balance Sheet, P&L, Stock Balance, Sales Analytics, Territory Target Variance, Salary Register, Monthly Attendance Sheet, Income Tax Deductions.

## React (`/sugar`)

| Page | What |
|---|---|
| **Purchase & Stores** `/purchase` | The flow (demands → inquiries → quotations → orders to receive → GRN → bills to pay), stock value by store, purchase orders, store issues by type, returnable gate passes with *Mark returned* |
| **Sugar Sales** `/sales` | Godown bags, open contracts, lifted and invoiced this month (GST), receivables; the **dispatch board** (weigh empty → weigh loaded, with the live reading or a typed weight); lifting for 30 days; receivable ageing; Delivery Orders lifted |
| **Finance** `/finance` | Bank, cash, payable, receivable, profit and EPS, PDCs; **draft vouchers: tick, Post, Print**; posted vouchers (print any); vouchers by type this month |
| **HR & Payroll** `/hr` | Staff, present / absent / late, biometric punches, payroll; attendance for 14 days; late marks with *Apply late penalties*; staff by department; payroll by month; attendance by shift |

New Desktop tiles: Purchase & Stores, Sugar Sales, Finance, HR & Payroll.

## Demo

`sc-demo` / `sc-reset-demo` (`setup/demo_erp.py`, everything tagged `DEMO-P7`):
- **Purchase:**
  - 15 store items and 8 suppliers, each with a withholding category
  - 3 purchase demands; an inquiry to 3 chemical suppliers with 3 quotations (see the comparative statement)
  - 6 POs: 5 received with **quality inspection**, 1 still to receive
  - 5 bills with withholding and input GST, plus a motor-rewinding service bill
  - 2 bank payments
- **Stores:** 5 store issues (Nov 2–6) to departments. Gate passes: a motor out for rewinding (due 12 Nov), a shaft back from machining, scrap sold.
- **Sales:**
  - 7 customers and a commission agent; 5 contracts (Sales Orders) at the rate list
  - **6 Delivery Orders weighed and lifted** (differences −0.15 % … +0.28 %), each with its gate pass and GST invoice
  - **a truck still loading**, and a DO waiting at the gate
  - one receipt, one **post-dated cheque**
- **Finance:** opening bank and cash balances on 1 July. 4 draft vouchers (2 BPV, 2 CPV) and a draft receipt to batch-post.
- **Fixed assets:** boiler, turbine, mill tandem, building, tractor and computers, Rs 99.5 crore, on both books.
- **HR:**
  - 30 employees (11 seasonal) on shifts A / B / C / General, with CNIC / EOBI numbers and device IDs
  - attendance and biometric check-ins for Nov 1–6, with 19 late marks
  - **October payroll**: 30 salary slips with EOBI, PF, group insurance and income tax on the TY2026 slabs, projected over the rest of the tax year
- **Demo users:** store.keeper, sales.officer, accounts.manager, hr.officer (password as the other demo staff).

## Tested

- **6 new integration tests** (`tests/test_erp.py`):
  - **Configuration:** a second run changes nothing; the chart is 5 deep with ledgers under their control groups; item groups are 4 deep; tax slab (Rs 4,286,400 → Rs 681,240; Rs 1,000,000 → Rs 4,000).
  - **Vouchers:** BPV / CRV / JV codes and series; batch posting (an already-posted voucher is reported, not reposted); multi-voucher PDF.
  - **Gate pass:** the return date is required; Out → Partly Returned → Returned; over-return refused.
  - **Sales weighment:**
    - expected weight; one weighment per DO
    - 4 % short refused; within tolerance → Completed
    - Delivery Note submitted; sales-dispatch gate pass with the DN's items
  - **Biometric and late penalty:** wrong token refused, duplicate punch ignored; 7 late marks → 2 days → Rs 4,000 on a Rs 60,000 base, once a month.
  - **Comparative statement:** lowest supplier, amount and spread.
- **Full suite: 143 green** (103 integration + 40 unit).

## Open points (need your input)

1. **Tax rates.** Confirm the GST, further tax and withholding rates, and whether the mill is a *company* (lower rates) for each category. Also: does sugar carry FED or retail-price GST in your case?
2. **Chart of accounts codes.** The 5-level structure is in place, but accounts are not numbered (1-01-001-0001-00001). Numbering renames every account; it can be done once you approve the code plan.
3. **Cheque layouts.** Send a scanned leaf of each bank's cheque to fine-tune the positions.
4. **Salary structure.** The demo split (basic 60 % / HRA 27 % / medical 6 % / conveyance 7 %), the EOBI basis (Punjab minimum wage Rs 40,000), PF 8.33 % and PESSI 6 % up to Rs 37,000 need your HR policy.
5. **Seasonal staff.** Contract dates, layoff at season end, and whether a retention allowance applies.
6. **Biometric devices.** Which make (ZKTeco, Suprema, Hikvision)? Most push to an HTTP endpoint or through middleware; the endpoint is ready for either.
7. **Delivery Order practice.** Is the DO issued against advance payment (a receipt before lifting), and does lifting have a validity period?
8. **Sales weighment tolerance** (±0.5 %) and the packing weight per bag (0.1 kg).
