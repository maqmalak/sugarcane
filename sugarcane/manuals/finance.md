---
title: Accounts manager — vouchers
roles: Accounts Manager, Accounts User
order: 130
---
# Accounts manager — vouchers and the books

## Vouchers
- Every journal is numbered by its type:
  - **JV**: journal
  - **BPV / BRV**: bank payment / receipt
  - **CPV / CRV**: cash payment / receipt

  The type comes from the accounts on it, so you never pick it.
- Staff save vouchers as **drafts**. On the **Finance** page, under *Vouchers waiting to be posted*:
  1. tick the vouchers you have checked
  2. **Print** them: one voucher a page, with amount in words and the Prepared / Checked / Approved / Received boxes
  3. **Post** them. Each is checked on its own; any that fails is listed with the reason, and the rest are posted.
- **Copy** a voucher with ERPNext's *Duplicate*. **Reverse** one with *Reverse Journal Entry* (never delete).

## Cheques
- Print cheques from the Payment Entry with the bank's **Cheque Print Template** (HBL, MCB, UBL, Allied, NBP, Meezan, Alfalah).
- A cheque dated later than the entry is a **post-dated cheque**: see the *Post Dated Cheques* report.

## Month end
- **Bank Reconciliation Tool** against each bank statement.
- Depreciation posts by itself (fixed assets on the *Accounting* and *Tax* books).
- Reports:
  - *Payables Projection* (what to pay in the next 8 weeks)
  - *Earnings Per Share*
  - *WPPF and WWF*
  - ERPNext's *Trial Balance*, *Balance Sheet*, *Profit and Loss*, *Accounts Payable / Receivable*

## Tax
- GST templates on sales and purchases.
- Withholding categories on suppliers (153(1)(a) goods, (b) services, (c) contracts) are deducted on the bill.
- Salaries' income tax is deducted in payroll.
