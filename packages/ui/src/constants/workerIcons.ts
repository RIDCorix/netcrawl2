/**
 * Maps lucide icon names (from SDK class_icon / Icon enum) to React components.
 * Must stay in sync with netcrawl/icons.py Icon enum.
 */

import {
  Bot, Pickaxe, Hammer, Wrench, Cog, Drill,
  Shield, ShieldCheck, Swords, Bug,
  Radar, Search, Eye, Compass, Map, ScanLine, Antenna, Satellite,
  Truck, Send, Route, ArrowRight, Workflow,
  Cpu, Database, HardDrive, Terminal, Code, Binary, Braces,
  Globe, Wifi, Network, Radio, Signal,
  Zap, Gauge, Timer, FlaskConical, Microscope, Sparkles, Crown, Star,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  // Default
  Bot,
  // Mining / Resources
  Pickaxe, Hammer, Wrench, Cog, Drill,
  // Combat / Defense
  Shield, ShieldCheck, Swords, Bug,
  // Exploration / Scanning
  Radar, Search, Eye, Compass, Map, ScanLine, Antenna, Satellite,
  // Transport / Movement
  Truck, Send, Route, ArrowRight, Workflow,
  // Compute / Data
  Cpu, Database, HardDrive, Terminal, Code, Binary, Braces,
  // Network / Communication
  Globe, Wifi, Network, Radio, Signal,
  // Utility
  Zap, Gauge, Timer, FlaskConical, Microscope, Sparkles, Crown, Star,
};

export function getWorkerIcon(iconName: string | undefined): LucideIcon {
  return ICON_MAP[iconName || 'Bot'] || Bot;
}
