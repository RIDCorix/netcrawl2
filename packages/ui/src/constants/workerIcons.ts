/**
 * Maps lucide icon names (from SDK class_icon) to React components.
 * Worker classes declare an icon name string; the UI resolves it here.
 */

import {
  Bot, Pickaxe, ShieldCheck, Radar, Search, Wrench, Hammer,
  Cpu, Zap, Eye, Cog, Bug, Truck, Antenna, Gauge,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Pickaxe,
  ShieldCheck,
  Radar,
  Search,
  Wrench,
  Hammer,
  Cpu,
  Zap,
  Eye,
  Cog,
  Bug,
  Truck,
  Antenna,
  Gauge,
};

export function getWorkerIcon(iconName: string | undefined): LucideIcon {
  return ICON_MAP[iconName || 'Bot'] || Bot;
}
