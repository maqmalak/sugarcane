import {
  Building2, Users2, Crown, Factory, Landmark, ShoppingCart, ShieldCheck, Truck, Scale, FlaskConical, Headphones, Cog, Megaphone, Monitor, Palette, Scissors, Package, Wrench,
  type LucideIcon,
} from "lucide-react";

/** "Production - BGT" → "Production" (department names carry the company abbreviation). */
export const deptLabel = (name: string) => name.replace(/ - [A-Z0-9]{2,6}$/, "");

/** An icon and colour for a department, from words in its name (textile mill departments first). */
const DEPT_ICONS: [RegExp, LucideIcon, string][] = [
  [/dye|colou?r|print/i, Palette, "fuchsia"],
  [/weav|knit|spin|yarn|loom|fabric/i, Factory, "indigo"],
  [/stitch|sew|cut|garment|tailor/i, Scissors, "pink"],
  [/finish|pack/i, Package, "orange"],
  [/production|manufactur|plant|mill/i, Factory, "indigo"],
  [/maint|engineer|mechanic|electric|utility/i, Wrench, "slate"],
  [/human|hr\b|people|admin/i, Users2, "violet"],
  [/financ|account|treasur/i, Landmark, "emerald"],
  [/purchas|procure|buy|store|inventory|warehouse/i, ShoppingCart, "amber"],
  [/quality|qc|qa\b|lab/i, ShieldCheck, "teal"],
  [/dispatch|logistic|ship|transport|deliver/i, Truck, "sky"],
  [/legal|compliance/i, Scale, "stone"],
  [/research|r&d|develop|design|sampl/i, FlaskConical, "cyan"],
  [/customer|service|support/i, Headphones, "rose"],
  [/sales|marketing|export|merchandis/i, Megaphone, "lime"],
  [/\bit\b|information|tech|system/i, Monitor, "blue"],
  [/management|director|executive|ceo/i, Crown, "yellow"],
  [/operation/i, Cog, "purple"],
];
export function deptLook(name: string): { icon: LucideIcon; hue: string } {
  const hit = DEPT_ICONS.find(([re]) => re.test(name));
  return hit ? { icon: hit[1], hue: hit[2] } : { icon: Building2, hue: "blue" };
}

