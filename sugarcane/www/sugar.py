import frappe

no_cache = 1


def get_context(context):
	"""The React app; signed-out visitors get the app's own login screen."""
	context.no_cache = 1
	context.sugar_site = frappe.local.site
	return context
