import frappe
def run():
    print(frappe.db.sql("select field, value from tabSingles where doctype='Sugar Settings' and field like 'overlap%%'"))
    for v in frappe.get_all("Version", filters={"ref_doctype": "Sugar Settings"}, fields=["creation", "owner", "data"], order_by="creation desc", limit=5):
        if "overlap" in v.data: print(v.creation, v.owner, v.data[:300])
