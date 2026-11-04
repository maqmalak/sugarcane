---
title: Setup — company, site, areas and growers
roles: Cane Admin, Cane Manager, Cane Staff
order: 5
---
# Setup — company, site, areas and growers

Set the mill up in this order: each step uses the one before it. Everything is under **Sugar Setup** (Desktop → Sugar Setup).

## 1 · Company settings and the season
1. **Sugar Settings → General**:
   - the company and the active season;
   - the maund (40 kg) and the hour the crushing day starts (07:00);
   - the mill's location, the journey standards and the survey tolerances.
2. **Sugar Settings → Accounts**: the ledgers every cane entry posts to.
   - They cover grower payable, cane purchase clearing, TPT bilty payable, road cess, grower loans, cash counter, JazzCash, strong room, and short & excess.
   - They are created on setup. Check them with the accountant.
3. **Crushing Seasons → 2026-27**:
   - dates, crushing target and the notified rate (per 40 kg);
   - road cess and the grower's share, subsidies;
   - TPT, binding and garbage, and production norms.

   Tokens copy the rates when they are issued, so change rates only at a season boundary.

### By-product NRV on the season
**NRV** stands for **Net Realisable Value**: the money a by-product actually brings in after the cost of selling it.

> **NRV = sale price − selling and handling cost**

The Crushing Season form uses it in three fields under **Production**: Molasses, Bagasse and Press Mud NRV (per kg).

**How costing uses it:** the mill's total cost covers cane plus processing. The by-products carry part of that cost at their NRV, and the rest falls on sugar:

> **cane cost + processing cost − by-product credit (at NRV) = net cost of sugar**

**Example:** molasses sells for Rs 30,000 a ton and costs Rs 1,100 a ton to sell and handle. Its NRV is Rs 28,900 a ton, which is **Rs 28.90 per kg**.

At the end, the actual sale value minus selling cost minus the NRV that was credited is posted to the *By-product Variance* account. The *By-product Realization* report shows this.

## 2 · Site setup
| Sugar Setup → | What to enter |
|---|---|
| Sources | Mill gate, check posts and depots. Each has its rates and TPT per vehicle type. |
| Loading Points | Source, circle, contractor, loading rate, season target. The pin and geofence radius (ELP photos must be taken inside it). The standard journey time to the mill. |
| Depots | Purchase points away from the mill: warehouse, weighbridge, users. |
| Vehicle Types | Gross and tare limits per type (a weight outside them is refused). The default lane. |
| Weighbridge Terminals | The PC's IP, allowed weights (gross / tare / both), lane, indicator. Platform sensors and auto-weigh. |
| CCTV Cameras | Place (gate / weighbridge), view (front, left, right, rear, top, ANPR, cabin), snapshot address and login. |
| Cash counters | Cash Counter 1 and 2 are created on setup. Drivers are registered at the gate. |

## 3 · Zone, circle, village
The order is division → district → zone → circle → sector → village. **Area map** shows the whole tree with pins and boundaries.
1. **Zones → New**:
   - enter the zone name and district;
   - draw the boundary on the map (tap the corners), walk it with GPS, or paste it;
   - drop the pin.
2. **Circles → New**:
   - circle name and a **3-digit circle code** (e.g. `013`);
   - the zone, the circle officer, the quota and incentives.
3. **Villages → New**: village name, a **3-digit village code** unique in the circle (`001`), and the circle. The village becomes `013-001`.

## 4 · Growers
1. **Growers → New**:
   - name and father / husband;
   - **CNIC** (13 digits, `33100-8680138-5`);
   - **mobile** (11 digits starting 03, `03007212058`);
   - circle and village.

   Wrong numbers are shown in red as you type.
2. **Bank**: the **IBAN** (24 characters, checked). The bank fills itself in from it. Growers without an IBAN are paid by cheque.
3. **Save**: the grower code is given (`013-001-0001` = circle 013 · village 001 · serial 0001), and the grower's payable account is set.
4. **Passbooks → New**: passbook number, grower, season and land holdings (murabba, killa, acres, ownership).

## Many growers at once — Grower Import (Excel)
1. **Grower Import → New → Download template**.
2. Fill one row per grower: name, father, CNIC, mobile, circle code, village code, and if you have them, passbook, acres, bank, IBAN and filer status.
3. Attach the file and **Start import**.
   - It runs in the background. Refresh to see *Completed* or *Completed with Errors*.
   - Tick *Create passbooks* to make a passbook for rows that have a passbook number.
4. Each row is checked:
   - CNIC and mobile are cleaned and checked (dashes, spaces and +92 are fine);
   - the IBAN is checked, and the bank is taken from it;
   - the circle and village codes must exist.
5. Rows with mistakes are not imported. They come back in an **error sheet** with the reason on each row. Fix them and import that sheet again.

## Guides and videos
**Help → Guides & videos → Setup**: the A4 guide with screenshots, the setup DFDs, and the video *Setting up the mill*.
