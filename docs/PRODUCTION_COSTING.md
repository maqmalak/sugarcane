# Sugar Production, By-products and Costing — as built

Built 2026-10-19 against the functional design *Sugar Production, By-Products & Costing* (13 Oct 2026). It also covers the extra asks:
- an in-process ledger
- FOH (factory overhead) in the costing
- process cost
- cost per 50 kg bag before tax, profit margin, GST, and price after GST

Everything posts through standard ERPNext stock and accounting.

## What the design asked for, and where it is

| Design item | Built as |
|---|---|
| DMR per day, prepared by the lab, approved by production | *Daily Manufacturing Report* (existing), now with the items below |
| **Per-shift capture** | **DMR Shift Detail**: one row per active shift. Cane received and stoppage minutes are filled from the CPRs and the stoppage log. Mill hours, bags, molasses, bagasse, bagasse burnt and press mud are entered per shift, and the day's figures become their sums. |
| **Sugar by grade** | **Sugar Grade** master: A (the existing 50 kg item), B and Refined, each its own item. **DMR Grade Output** gives bags by grade; the day's bags are their sum. |
| **Bagasse burnt vs to the yard** | DMR *Bagasse burnt in boilers* and *Bagasse to the yard* (surplus). |
| Ratios | Already there: recovery, Pol % cane, by-products % cane, Pol losses, crushing rate, capacity use. New: **mixed juice purity** and **mill extraction** (Pol in mixed juice ÷ Pol in cane; mixed juice kg from the flow meter). |
| **By-product Rate** | Per season and item: sale rate per ton, selling and handling cost per ton, valid from. NRV per kg is worked out. Production uses the rate valid on its day, else the season's NRV. Set up from each season's NRV. |
| Production posting | **Daily Production Entry**, now **per grade**: a Work Order + Manufacture for each grade. Cane is shared by bags; by-products go on the largest grade. **Bagasse burnt** is issued to the Boiler House as *Power and Steam – Bagasse Burnt* when *Credit bagasse burnt in own boilers* is on (sugar cost unchanged, power cost visible). When off, only the surplus is credited. |
| **Daily provisional cost** | Stock cost + the mill's own cane costs (subsidies, its cess share) + the season's **budgeted processing cost per ton of cane**, per bag, on every production day. |
| **Cost centres** | The design's tree: *Cane Procurement* (Cane Yard, Cane), *Production* (Mill House, Boiling House, Process House, Centrifugal and Packing, Boiler House, Power House, Laboratory), *Service* (Workshop, Stores, Administration), *Off-season*. Existing centres moved under their groups. |
| **Cost Allocation Rule** | Service centre → production centres, by fixed %, equal or hours. Defaults: Workshop, Stores and Administration. |
| **Costing Run** (monthly / season close) | Detailed below. |
| **Off-season cost** | Expenses on the *Off-season* centre since the previous season make the pool. Each run takes its share by cane crushed (against the season target); the season close takes the rest. |
| **By-product variance** | Season close: realised (sales − selling cost) − NRV credited on what was sold. The difference is moved from the sales ledger to *By-product Variance*. |
| Cost Accountant role | New role: costing runs, by-product rates, allocation rules. Manual in Help. |
| Reports | All 8 + the DMR print format, plus the In-process Ledger (below). |
| MIS | The Sugar tile shows the provisional cost per bag and the last final cost with the price after GST. |

Road cess stays as you confirmed: deposited in full, 50 % deducted from the grower, 50 % a cane cost of the mill. (The design treats it as fully a grower deduction.)

## The Costing Run

For a month, or the season's last stretch for a *Season Close*.

**Cane cost**
- **Cane price:** the cane consumed by production at its stock value.
- **Cane costs paid by the mill:** the *Cane Cost of Sales* ledgers (subsidies, the mill's cess share, depot freight and commission, transit shortage, loading and unloading).

**Processing**
- Expense GL of the *Production*, *Service* and *Cane Procurement* cost centres:
  - store issues classified by the item's group (chemicals; fuel and lubricants → power and fuel; spares → stores)
  - depreciation entries
  - the rest by account: salaries, power, repairs, overheads
- The service centres are allocated by the rules.
- Expense on other centres (Sales, Main) is shown as *outside production*, not costed.

**Cost structure (the FOH layout)**

| Line | Contents |
|---|---|
| Direct materials | cane price + cane costs paid by the mill + chemicals + packing |
| Direct labour | salaries booked to the production departments |
| **Prime cost** | direct materials + direct labour |
| **Factory overhead (FOH)** | power and fuel, stores and spares, repair and maintenance, depreciation, factory overheads, service departments allocated in, off-season share |
| **Cost of production** | prime cost + FOH (= the joint cost) |
| By-product credit | molasses, bagasse, press mud at NRV |
| **Net cost of sugar** | → per kg, **per 50 kg bag**, per ton of cane, cane share % |

**Process cost.** The processing cost of each process after the service departments are allocated in, with its share, cost per ton of cane and cost per bag:
- cane yard and handling
- milling
- clarification and boiling
- centrifugal and packing (with the packing material)
- steam and power
- laboratory

**Price per 50 kg bag**

| Line | |
|---|---|
| Cost per 50 kg bag (before tax) | the net cost per bag |
| + Profit margin % | Sugar Settings → 10 % (can be changed on the run) |
| = Ex-mill price before GST | |
| + GST % | Sugar Settings → 18 % (can be changed on the run) |
| = **Price per 50 kg bag after GST** | |
| Cost per bag with GST | the GST-inclusive break-even |

**Postings on submit**
- *Carry the full cost into sugar stock* (default on): a Stock Reconciliation on the last day revalues every grade in the godown to the full cost per bag, against *Cost of Production Absorbed*. Later issues and sales are reposted at the new rate.
- *Season Close*: the by-product variance journal.
- Cancelling the run reverses both.

## Reports (Report Centre → Production / Costing / Laboratory)

| Report | Shows |
|---|---|
| **Production Summary** | cane crushed, bags **by grade**, sugar, recovery, molasses / bagasse (and burnt) / press mud with % cane, stoppage hours, by day, week or month |
| **By-product Stock and Movement** | opening, produced, burnt in the boilers, sold, other, closing (t), NRV credited |
| **By-product Realization** | sold (t), NRV credited, sales, selling cost, realised, variance, per ton |
| **Cost of Production Statement** | the full statement above — direct materials, labour, prime cost, FOH lines, cost of production, by-product credit, net cost, process cost, price per bag before / after GST — **with the previous season beside it** |
| **In-process Ledger** | day by day:<br>• cane in the yard: opening, received, into process, closing (t and Rs)<br>• packing and the day's actual processing cost<br>• sugar out at stock cost, by-products out at NRV<br>• the day's full cost and per bag |
| **Cost per Bag Trend** | each day's stock cost and provisional cost per bag against the costing run's final cost (chart) |
| **Cost Center Expense Analysis** | processing cost by cost centre × element after allocation (with the part allocated in), per ton of cane |
| **Recovery vs Cost** | by month (recovery % and cost per kg, from the runs) or by circle (vehicle-sample recovery, cane cost per ton, estimated cost per kg) |
| **Pol Loss Analysis** | Pol in bagasse, press mud, molasses, undetermined, total, with recovery, mill extraction and MJ purity, per day |
| **DMR print format** | the whole day on one page: cane, production by grade, bagasse split, performance and losses, shifts, lab averages, season to date, three signatures |

## Demo

On the closed 2025-26 season (140 days):
- **By-product rates** from the season's NRV.
- **Off-season:** an overhaul and off-season salaries, July–October 2025 (Rs 46 m pool).
- **Every month:** salaries by department, depreciation, purchased power, repairs and overheads.
- **Every Monday:** chemicals, fuel and spares issued to the departments.
- **Costing runs:** one per month and a Season Close for March.

**Monthly runs** (each posted; the sugar in the godown is revalued upward each time):

| Month | Cost per kg | Cost per 50 kg bag | After 10 % margin + 18 % GST | Revaluation |
|---|---:|---:|---:|---:|
| Nov 2025 | 130.21 | 6,511 | 8,451 | 11.17 m |
| Dec 2025 | 127.78 | 6,389 | 8,293 | 16.55 m |
| Jan 2026 | 128.19 | 6,410 | 8,320 | 6.61 m |
| Feb 2026 | 130.00 | 6,500 | 8,437 | 7.19 m |
| Mar 2026 (season close) | 197.50 | 9,875 | 12,818 | 15.00 m |

March is a 20-day tail: 3,441 t crushed carries a full month of fixed cost. The season close also posts the **by-product variance, Rs 6.26 m**: molasses sold at Rs 36 / kg against Rs 32 NRV, less selling cost.

**The whole season** (*Cost of Production Statement*, 2025-26), in Rs millions:

| Line | Rs m |
|---|---:|
| Direct materials (cane 506.21 incl. the mill's own cane costs, chemicals, packing) | 516.84 |
| Direct labour | 63.50 |
| **Prime cost** | **580.34** |
| **FOH** | **292.16** |
| **Cost of production** | **872.50** |
| By-product credit | (207.91) |
| **Net cost of sugar** | **664.59** |

Unit results:
- **Rs 133.85 / kg**, **Rs 6,692 / bag** (FOH Rs 2,942 / bag), Rs 13,588 / t cane
- cane share 58 %
- price after 10 % margin and 18 % GST: Rs 8,687

FOH includes the burnt bagasse at NRV, charged to steam and power (about Rs 133 m). It is offset by the same bagasse in the by-product credit, so the net cost is unchanged. That is why *Steam and power* shows Rs 4,194 / t cane in the process cost.

**Before this, a stock repost on the dev bench.** This development bench runs no background worker. ERPNext queues a repost for every back-dated stock entry, and 1,833 had queued up, leaving stale valuation rates. The first costing runs read them, and their revaluations came out negative. They were cancelled, the reposts run by hand (`sugarcane.setup.repost_all.until_done`), and the runs redone. A production server's scheduler runs these reposts by itself.

The live 2026-27 season keeps its own provisional costs per bag.

## Tested

- **7 calculation tests** (`tests/test_costing_calc.py`):
  - **the design's worked example** — Rs 1,429 m joint cost, Rs 200.75 m by-product credit, **Rs 122.83 / kg, Rs 6,141 / bag, Rs 12,283 / t cane, cane share 71.7 %**, and the "0.1 % recovery ≈ Rs 1.2 / kg" rule
  - NRV, allocation (fixed %, equal, hours), the off-season spread, element classification, mill extraction
  - prime cost / FOH; the price build-up (Rs 6,141.25 + 10 % → 6,755.38; + 18 % GST → 7,971.35)
- **Integration test** (`tests/test_production_costing.py`):
  - the DMR: grades → bags, shifts add up to the cane received, bagasse to the yard, MJ purity, extraction; more burnt than produced is refused
  - production per grade: cane shared, the By-product Rate's NRV used, by-products on the largest grade, burnt bagasse issued to the Boiler House, provisional cost
  - the costing run: cane price, salaries and repairs by element, the Workshop allocated away, by-product credit, net and per bag, revaluation of the godown at the full cost, cancel reverses
- **Full suite: 155 green** (108 integration + 40 unit + 7 costing-calculation).

## Open points

1. **Sugar grades and their BOMs.** All grades use the same bag BOM (standard recovery) and get the same full cost per bag in the revaluation. Should grade B or Refined carry a different share of cost (for example by relative sale value)?
2. **Direct labour.** Taken as salaries booked to the production departments; service departments' salaries are FOH. Confirm the mill's split.
3. **Allocation rules.** The defaults (Workshop 40 / 30 / 20 / 10, Stores equal, Administration by fixed %) are placeholders; send the mill's drivers.
4. **Profit margin and GST.** 10 % and 18 % are placeholders. Sugar may also carry FED or retail-price GST — the GST line is a single rate.
5. **Bagasse burnt.** Credited at NRV and charged to Power & Steam (sugar cost unchanged). Turn the setting off if burnt bagasse should not be credited at all.
6. **Stock reposts.** Back-dated entries and the costing revaluation queue a stock repost. In production the scheduler runs them within the hour; on a development machine with no worker they wait (they were run by hand for the demo).
