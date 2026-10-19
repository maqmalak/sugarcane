---
title: Sales officer — sugar dispatch
roles: Sales User, Sales Manager
order: 120
---
# Sales officer — sugar dispatch

## Contracts
- A dealer's or buyer's contract is a **Sales Order** at the *Sugar Rate List*. Add the agent or broker (*Sales Partner*) for their commission.
- Tax templates:
  - *Pakistan GST 18%* for a registered buyer
  - *GST 18% + Further Tax 4%* for an unregistered buyer
  - *Export – Zero Rated* for exports

## Lifting a Delivery Order
1. Make the **Delivery Order** (Delivery Note) from the Sales Order: bags, the DO number and the truck. Leave it as a **draft**.
2. **Sugar Sales → Dispatch board → At the gate.** When the buyer's empty truck is on the weighbridge, choose **Weigh empty**.
3. Load the bags. The truck is shown under **Loading**.
4. Back on the bridge, choose **Weigh loaded**. The ERP compares the net weight with bags × 50 kg (+ packing).
   - **Within ±0.5 %**: the Delivery Order posts (the sugar leaves the godown stock) and the **dispatch gate pass** prints.
   - **Outside**: it is refused. Count the bags again. Only a Sales Manager can accept a difference, with a note.
5. Make the **Sales Invoice** from the Delivery Order, and enter the buyer's payment (or a post-dated cheque) as a Payment Entry.

## Reports
*Sugar Dispatch Register*, ERPNext's *Accounts Receivable* and *Sales Analytics*.
