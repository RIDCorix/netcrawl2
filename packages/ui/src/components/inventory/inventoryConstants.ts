import {
  PickaxeBasic, PickaxeIron, PickaxeDiamond,
  CpuBasic, CpuAdvanced, RamBasic, RamAdvanced,
  BeaconIcon, ShieldIcon, AntivirusIcon, ScannerIcon,
  ChipPackBasic, ChipPackPremium,
  MemoryAllocator, FullstackPickaxe,
  ChipSpeed,
} from '../icons/GameIcons';
import { Database, Cpu, AlertTriangle } from 'lucide-react';

export const ITEM_ICONS: Record<string, any> = {
  pickaxe_basic: PickaxeBasic, pickaxe_iron: PickaxeIron, pickaxe_diamond: PickaxeDiamond,
  shield: ShieldIcon, beacon: BeaconIcon,
  data_fragment: Database, rp_shard: Cpu, bad_data: AlertTriangle,
  chip_pack_basic: ChipPackBasic, chip_pack_premium: ChipPackPremium,
  cpu_basic: CpuBasic, cpu_advanced: CpuAdvanced,
  ram_basic: RamBasic, ram_advanced: RamAdvanced,
  scanner: ScannerIcon, signal_booster: BeaconIcon,
  overclock_kit: ChipSpeed,
  antivirus_module: AntivirusIcon,
  memory_allocator: MemoryAllocator, fullstack_pickaxe: FullstackPickaxe,
};

export const INV_TABS_DEF = [
  { key: 'all', labelKey: 'ui.tab_all' },
  { key: 'equipment', labelKey: 'ui.tab_equipment', types: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond', 'shield', 'beacon'] },
  { key: 'materials', labelKey: 'ui.tab_materials', types: ['data_fragment', 'rp_shard'] },
  { key: 'chips', labelKey: 'ui.tab_chips' },
  { key: 'packs', labelKey: 'ui.tab_packs', types: ['chip_pack_basic', 'chip_pack_premium'] },
];

export const CRAFT_TABS_DEF = [
  { key: 'all', labelKey: 'ui.tab_all' },
  { key: 'tools', labelKey: 'ui.tab_tools', ids: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'] },
  { key: 'gear', labelKey: 'ui.tab_gear', ids: ['shield', 'beacon', 'cpu_basic', 'cpu_advanced', 'ram_basic', 'ram_advanced'] },
  { key: 'shop', labelKey: 'ui.tab_shop' },
];

export interface Recipe {
  id: string;
  name: string;
  description: string;
  output: { itemType: string; count: number; metadata?: { efficiency?: number } };
  cost: { data?: number; rp?: number; credits?: number };
  affordable: boolean;
  unlocked: boolean;
  unlockHint?: string;
}

export interface CraftFamily {
  id: string;
  title: string;
  icon: any;
  color: string;
  recipeIds: string[];
}

export const CRAFT_FAMILIES: CraftFamily[] = [
  { id: 'pickaxes', title: 'Pickaxe', icon: PickaxeBasic, color: '#c0c0c0', recipeIds: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'] },
  { id: 'cpu',      title: 'CPU',     icon: CpuBasic,     color: '#f59e0b', recipeIds: ['cpu_basic', 'cpu_advanced'] },
  { id: 'ram',      title: 'RAM',     icon: RamBasic,     color: '#a78bfa', recipeIds: ['ram_basic', 'ram_advanced'] },
  { id: 'gadgets',  title: 'Gadget',  icon: ShieldIcon,   color: '#4ade80', recipeIds: ['shield', 'beacon'] },
];
