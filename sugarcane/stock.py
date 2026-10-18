"""Stock quantities for the cane logic, read straight from the stock ledger. erpnext's get_stock_balance checks that the user
may read Items, which gate, depot and production staff need not have."""

from frappe.utils import flt, getdate


def stock_qty(item_code: str, warehouse: str, posting_date=None, posting_time: str = "23:59:59") -> float:
	from erpnext.stock.stock_ledger import get_previous_sle

	if not item_code or not warehouse:
		return 0.0
	sle = get_previous_sle({"item_code": item_code, "warehouse": warehouse, "posting_date": getdate(posting_date or "2999-12-31"),
		"posting_time": posting_time})
	return flt(sle.get("qty_after_transaction")) if sle else 0.0
