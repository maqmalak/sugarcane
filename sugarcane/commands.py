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


@click.command("sc-season-demo")
@click.option("--loads-per-day", default=40, help="Loads at the peak of the season")
@click.option("--until", default=None, help="Stop after this crushing day (YYYY-MM-DD); run again to continue")
@click.option("--reset", is_flag=True, help="Remove the 2025-26 season demo instead")
@pass_context
def sc_season_demo(context, loads_per_day, until, reset):
	"""A full, closed 2025-26 crushing season behind the live demo (Phase 9). Resumable; about 0.4 s a load."""
	frappe.init(get_site(context))
	frappe.connect()
	try:
		from sugarcane.setup import demo_season

		demo_season.reset() if reset else demo_season.run(loads_per_day, until)
	finally:
		frappe.destroy()


commands = [sc_demo, sc_reset_demo, sc_season_demo]
