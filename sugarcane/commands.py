import click
import frappe
from frappe.commands import get_site, pass_context


@click.command("sc-demo")
@click.option("--growers", default=500, help="Number of demo growers")
@pass_context
def sc_demo(context, growers):
	"""Create the MicroMax Sugar Mills demo masters (idempotent)."""
	frappe.init(get_site(context))
	frappe.connect()
	try:
		from sugarcane.setup.demo import run

		run(growers)
	finally:
		frappe.destroy()


@click.command("sc-reset-demo")
@pass_context
def sc_reset_demo(context):
	"""Delete every demo record (is_demo = 1) and create the demo masters again."""
	frappe.init(get_site(context))
	frappe.connect()
	try:
		from sugarcane.setup.demo import reset

		reset()
	finally:
		frappe.destroy()


commands = [sc_demo, sc_reset_demo]
