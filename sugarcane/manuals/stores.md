---
title: Store keeper and purchase
roles: Stock User, Stock Manager, Purchase User, Purchase Manager
order: 110
---
# Store keeper and purchase

The forms are ERPNext's own. The *Purchase & Stores* page links to each one.

## Buying
1. A department asks for material in a **Purchase demand** (Material Request).
2. Purchase sends an **Inquiry** (Request for Quotation) to three or more suppliers.
3. Enter each reply as a **Supplier Quotation**.
4. Print the **Comparative Statement** report for the purchase committee: every supplier's rate, the lowest, and the last PO rate.
5. Make the **Purchase Order** to the chosen supplier. Use the IPO- series for an import.
6. When the goods arrive, make the **GRN** (Purchase Receipt) from the PO. Items that need a **quality inspection** (lime, sulphur, bags, diesel) can't be received until the inspection is accepted.
7. Accounts makes the **bill** (Purchase Invoice: Local, Site, Import or Service). Withholding tax and input GST are applied from the supplier's category.

## Issuing from the stores
- **Store Issue** (Stock Entry) to a department's cost centre.
- **Store Return** when material comes back; **Store Transfer** between stores; **Tools Issue / Return** for tools.

## Gate passes
- Nothing leaves the mill without a **Gate Pass**:
  - **Returnable**: repair, machining. Give the date it should be back.
  - **Non-Returnable**: scrap, rejected material.
- When returnable items come back, use **Mark returned** on the Purchase & Stores page, or record them item by item.
- Sugar trucks get their gate pass by themselves (Sugar Sales).

## Reports
*Comparative Statement*, *Gate Pass Outstanding*, *Payables Projection*, and ERPNext's *Stock Balance* and *Stock Ledger*.
