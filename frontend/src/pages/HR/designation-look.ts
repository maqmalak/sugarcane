import {
  BadgeCheck, Briefcase, Calculator, ClipboardCheck, ClipboardList, Cog, Crown, HandHelping, HardHat, Laptop, Palette,
  PenTool, ScanSearch, Shield, Sparkles, Truck, UserCog, Warehouse, Wrench, Zap, FlaskConical, Scissors, Package,
  type LucideIcon,
} from "lucide-react";

/** An icon and colour for a designation, from words in its title (mill roles first). */
const DESIGNATION_ICONS: [RegExp, LucideIcon, string][] = [
  [/\bhelper\b|\bhlp\b/i, HandHelping, "sky"],
  [/operat|machine|\bmc\b/i, Cog, "indigo"],
  [/director|\bgm\b|general manager|\bceo\b|chairman|owner/i, Crown, "yellow"],
  [/manager|\bapm\b|\bpm\b|head|incharge|in-charge/i, UserCog, "amber"],
  [/supervis|foreman|jamadar|mistri/i, ClipboardCheck, "orange"],
  [/engineer/i, HardHat, "slate"],
  [/electric|wireman/i, Zap, "yellow"],
  [/technic|mechanic|fitter|welder|maint/i, Wrench, "stone"],
  [/design|artist|studio|engrav/i, Palette, "fuchsia"],
  [/account|cashier|finance|audit|tax/i, Calculator, "emerald"],
  [/check|inspect|quality|\bqc\b/i, ScanSearch, "teal"],
  [/chemist|lab|dyer|colou?r/i, FlaskConical, "purple"],
  [/driver|transport|loader/i, Truck, "cyan"],
  [/guard|security|chowkidar|watch/i, Shield, "red"],
  [/store|keeper|grey|godown/i, Warehouse, "lime"],
  [/sweep|clean|janitor|mali|gardener/i, Sparkles, "green"],
  [/pack|fold/i, Package, "orange"],
  [/cutt|tailor|stitch|mend/i, Scissors, "pink"],
  [/\bit\b|computer|developer|programmer/i, Laptop, "blue"],
  [/clerk|assistant|officer|admin|time ?keep|operator data|entry/i, ClipboardList, "violet"],
  [/draft|cad|plan/i, PenTool, "rose"],
  [/trainee|apprentice|intern/i, BadgeCheck, "cyan"],
];

export function designationLook(title: string): { icon: LucideIcon; hue: string } {
  const hit = DESIGNATION_ICONS.find(([re]) => re.test(title));
  return hit ? { icon: hit[1], hue: hit[2] } : { icon: Briefcase, hue: "blue" };
}
