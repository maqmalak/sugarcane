// After `vite build`: copy the built index.html to sugarcane/www/sugar.html so Frappe serves the SPA at /sugar
// (hooks.py → website_route_rules sends /sugar/* there too). The CSRF token is filled in by Jinja on each request.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, "../../sugarcane/public/frontend/index.html");
const target = resolve(here, "../../sugarcane/www/sugar.html");
const html = readFileSync(built, "utf8").replace(
  "<!-- frappe-boot -->",
  "<script>window.csrf_token = '{{ frappe.session.csrf_token }}'; window.sugar_site = '{{ sugar_site }}';</script>",
);
writeFileSync(target, html);
console.log("wrote", target);
