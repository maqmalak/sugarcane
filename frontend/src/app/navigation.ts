import {
  Banknote, BarChart3, Beaker, ClipboardList, Factory, Gauge, Home, LayoutDashboard, Map, MapPinned, Receipt, ScrollText, Ticket,
  Truck, UserCog, Users, Warehouse, Weight, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Any of these roles shows the item (System Manager always sees it). Empty = every staff user. */
  roles: string[];
  /** Phase the screen arrives in; later phases show a "coming" page. */
  phase: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const MANAGERS = ["Cane Manager", "Cane Admin"];

export const NAVIGATION: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Home", path: "/", icon: Home, roles: [], phase: 0 },
      { label: "MIS Dashboard", path: "/mis", icon: LayoutDashboard, roles: [...MANAGERS, "MIS Viewer"], phase: 8 },
    ],
  },
  {
    label: "Growers & Survey",
    items: [
      { label: "Growers", path: "/growers", icon: Users,
        roles: [...MANAGERS, "Circle Officer", "Cane Accountant", "MIS Viewer"], phase: 0 },
      { label: "Survey Map", path: "/survey", icon: Map, roles: [...MANAGERS, "Circle Officer", "Surveyor", "MIS Viewer"], phase: 1 },
      { label: "Survey Dashboard", path: "/survey/dashboard", icon: BarChart3, roles: [...MANAGERS, "Circle Officer", "Surveyor", "MIS Viewer"], phase: 1 },
      { label: "Area Map", path: "/geo", icon: MapPinned, roles: [...MANAGERS, "Circle Officer"], phase: 1 },
      { label: "Field Force", path: "/field-force", icon: UserCog, roles: [...MANAGERS, "Circle Officer"], phase: 1 },
      { label: "Indents", path: "/indents", icon: ClipboardList, roles: [...MANAGERS, "Indent Clerk", "Circle Officer"], phase: 2 },
    ],
  },
  {
    label: "Mill Gate",
    items: [
      { label: "Token Issue", path: "/tokens", icon: Ticket, roles: [...MANAGERS, "Token Clerk"], phase: 3 },
      { label: "Yard Board", path: "/yard", icon: Warehouse, roles: [...MANAGERS, "Yard Supervisor", "MIS Viewer"], phase: 3 },
      { label: "Weighbridge", path: "/weighbridge", icon: Weight, roles: [...MANAGERS, "Gross Weighman", "Tare Weighman"], phase: 3 },
      { label: "CPRs", path: "/cpr", icon: Receipt, roles: [...MANAGERS, "Cane Accountant", "Cane Cashier"], phase: 3 },
      { label: "Bilty Cash Counter", path: "/bilty", icon: Truck, roles: [...MANAGERS, "Cane Cashier"], phase: 3 },
    ],
  },
  {
    label: "Accounts",
    items: [
      { label: "Payment Scrolls", path: "/payments", icon: Banknote, roles: [...MANAGERS, "Cane Accountant"], phase: 6 },
      { label: "Grower Ledgers", path: "/ledgers", icon: ScrollText, roles: [...MANAGERS, "Cane Accountant"], phase: 6 },
    ],
  },
  {
    label: "Plant",
    items: [
      { label: "Lab Hourly Entry", path: "/lab", icon: Beaker, roles: [...MANAGERS, "Lab Chemist"], phase: 5 },
      { label: "Production", path: "/production", icon: Factory, roles: [...MANAGERS, "Production Manager"], phase: 5 },
      { label: "Plant Levels", path: "/plant", icon: Gauge, roles: [...MANAGERS, "Production Manager", "MIS Viewer"], phase: 5 },
    ],
  },
];

/** Phases whose screens are built; later items show a "coming in phase N" page. */
export const BUILT_PHASE = 1;

export function visibleNavigation(hasRole: (...roles: string[]) => boolean): NavGroup[] {
  return NAVIGATION.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.length === 0 || hasRole(...i.roles)) }))
    .filter((g) => g.items.length > 0);
}

export function findNavItem(path: string): NavItem | undefined {
  return NAVIGATION.flatMap((g) => g.items).find((i) => i.path === path);
}
