"""General Ledger filter choices for the React finance pages (copy of micromax.api.gl_filter_options)."""
import frappe


@frappe.whitelist()
def gl_filter_options(company: str, party_type: str | None = None, txt: str | None = None) -> dict:
    """Choices for the General Ledger filters, limited to what the company actually has in its ledger:
    parties of `party_type` it has posted against, and (for the voucher picker) its voucher numbers matching `txt`."""
    frappe.has_permission("GL Entry", "read", throw=True)
    out = {"parties": [], "vouchers": []}
    if party_type:
        out["parties"] = frappe.db.sql_list(
            """select distinct party from `tabGL Entry` where company = %s and party_type = %s and is_cancelled = 0
            and ifnull(party, '') != '' order by party""", (company, party_type))
    if txt is not None:
        out["vouchers"] = frappe.db.sql(
            """select voucher_no, max(voucher_type) voucher_type from `tabGL Entry` where company = %s and is_cancelled = 0
            and voucher_no like %s group by voucher_no order by max(posting_date) desc limit 20""",
            (company, f"%{txt}%"), as_dict=True)
    return out
