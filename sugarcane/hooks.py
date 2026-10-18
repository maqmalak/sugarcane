app_name = "sugarcane"
app_title = "Sugarcane"
app_publisher = "MicroMax"
app_description = "MicroMax Sugar Mills ERP: cane survey, indenting, procurement, weighbridge, CPR, laboratory, production, cane accounting"
app_email = "maqmalak@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "sugarcane",
# 		"logo": "/assets/sugarcane/logo.png",
# 		"title": "Sugarcane",
# 		"route": "/sugarcane",
# 		"has_permission": "sugarcane.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/sugarcane/css/sugarcane.css"
# app_include_js = "/assets/sugarcane/js/sugarcane.js"

# include js, css files in header of web template
# web_include_css = "/assets/sugarcane/css/sugarcane.css"
# web_include_js = "/assets/sugarcane/js/sugarcane.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "sugarcane/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "sugarcane/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "sugarcane.utils.jinja_methods",
# 	"filters": "sugarcane.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "sugarcane.install.before_install"
# after_install = "sugarcane.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "sugarcane.uninstall.before_uninstall"
# after_uninstall = "sugarcane.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "sugarcane.utils.before_app_install"
# after_app_install = "sugarcane.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "sugarcane.utils.before_app_uninstall"
# after_app_uninstall = "sugarcane.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "sugarcane.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "sugarcane.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["sugarcane.search.awesomebar_results"]

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"sugarcane.tasks.all"
# 	],
# 	"daily": [
# 		"sugarcane.tasks.daily"
# 	],
# 	"hourly": [
# 		"sugarcane.tasks.hourly"
# 	],
# 	"weekly": [
# 		"sugarcane.tasks.weekly"
# 	],
# 	"monthly": [
# 		"sugarcane.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "sugarcane.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "sugarcane.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# The React form's Connections tab calls mm_core; on this app's sites it also finds every sugar DocType linking here
override_whitelisted_methods = {
	"mm_core.connections.get_connections": "sugarcane.api.v1.connections.get_connections",
	# the Desktop's Needs Attention, Recent Activity and app tiles show cane work instead of selling / buying
	"mm_core.home.get_home": "sugarcane.api.v1.home.get_home",
	"mm_core.home.approve": "sugarcane.api.v1.home.approve",
	# the approvals inbox also lists open overlap reviews (accept both / reject one)
	"mm_core.approvals.get_inbox": "sugarcane.api.v1.approvals.get_inbox",
	"mm_core.approvals.act": "sugarcane.api.v1.approvals.act",
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "sugarcane.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["sugarcane.utils.before_request"]
# after_request = ["sugarcane.utils.after_request"]

# Job Events
# ----------
# before_job = ["sugarcane.utils.before_job"]
# after_job = ["sugarcane.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"sugarcane.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []


# ---------------------------------------------------------------- MicroMax Sugar Mills ERP

required_apps = ["erpnext", "hrms"]

before_install = "sugarcane.setup.install.before_install"
after_install = "sugarcane.setup.install.after_install"
after_migrate = "sugarcane.setup.install.after_migrate"

fixtures = [
	{"dt": "Role", "filters": [["name", "in", [
		"Cane Manager", "Cane Admin", "Circle Officer", "Surveyor", "Indent Clerk", "Token Clerk", "Gross Weighman",
		"Tare Weighman", "Yard Supervisor", "Cane Cashier", "Lab Chemist", "Production Manager", "Cane Accountant",
		"Depot User", "LP Operator", "ELP Auditor", "MIS Viewer"]]]},
	{"dt": "Party Type", "filters": [["name", "=", "Grower"]]},
]

# React app at /sugar (built into sugarcane/public/frontend, page in www/sugar.html)
website_route_rules = [{"from_route": "/sugar/<path:app_path>", "to_route": "sugar"}]

# pin + boundary + area on every level of the area hierarchy
doc_events = {
	dt: {"validate": "sugarcane.geo.validate_geo"}
	for dt in ("Sugar Division", "Sugar District", "Sugar Zone", "Cane Circle", "Cane Sector", "Cane Village", "Competitor Mill")
}
# distance and standard journey time to the mill
doc_events.update({dt: {"validate": "sugarcane.journey.validate_journey"} for dt in ("Cane Source", "Cane Depot", "Loading Point")})
# bell notifications (sugarcane.notify)
doc_events.update({
	"Survey Overlap Review": {"after_insert": "sugarcane.notify.overlap_review_inserted", "on_update": "sugarcane.notify.overlap_review_updated"},
	"Survey Device": {"after_insert": "sugarcane.notify.device_inserted"},
	"Surveyor Attendance": {"on_update": "sugarcane.notify.attendance_updated"},
})

# Indents past their last valid day become Expired (bench schedule must run for this site in production)
scheduler_events = {
	"daily": ["sugarcane.cane_indenting.generator.expire_due"],
	"cron": {"15 7 * * *": ["sugarcane.cane_procurement.procurement.auto_close_previous_day"]},
}
