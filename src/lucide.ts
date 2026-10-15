import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  ArrowDownUp,
  Lock,
  Search,
  Swords,
  ShoppingCart,
  Package,
  Gift,
  Backpack,
  Award,
  Sparkles,
  Coins,
  Star,
  Zap,
  Shield,
  Heart,
  Flame,
  X,
  Check,
  ChevronRight,
  Eye,
  Settings,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  sort: ArrowDownUp,
  "arrow-down-up": ArrowDownUp,
  lock: Lock,
  search: Search,
  equip: Swords,
  swords: Swords,
  shop: ShoppingCart,
  "shopping-cart": ShoppingCart,
  storage: Package,
  package: Package,
  boss: Gift,
  gift: Gift,
  bag: Backpack,
  backpack: Backpack,
  medal: Award,
  award: Award,
  sparkles: Sparkles,
  coin: Coins,
  coins: Coins,
  star: Star,
  zap: Zap,
  shield: Shield,
  heart: Heart,
  flame: Flame,
  x: X,
  check: Check,
  "chevron-right": ChevronRight,
  eye: Eye,
  settings: Settings,
  help: HelpCircle,
};

const cache = new Map<string, string>();

/** Returns an inline SVG string for the specified Lucide icon name. */
export function lucideIcon(name: string, size = 14, className = "inline-block align-middle"): string {
  const key = `${name}:${size}:${className}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const Comp = ICON_MAP[name.toLowerCase()];
  if (!Comp) return "";

  try {
    const svg = renderToString(
      createElement(Comp, {
        size,
        className,
        style: { display: "inline-block", verticalAlign: "middle" },
      })
    );
    cache.set(key, svg);
    return svg;
  } catch {
    return "";
  }
}
