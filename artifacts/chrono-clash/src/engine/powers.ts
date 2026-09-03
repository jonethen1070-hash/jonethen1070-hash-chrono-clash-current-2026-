import { ENERGY_FREEZE, ENERGY_TIMESHIFT, ENERGY_REWIND, PowerId } from "./types";

export const DEFAULT_POWER_MAX = 5;
export const POWER_CHARGE_COIN_COST = 50;

export interface PowerDefinition {
  id: string;
  displayName: string;
  icon: string;
  maxCharges: number;
  coinCost: number;
  rewardedAd: boolean;
  consumesCharge: boolean;
  storefront: boolean;
  energyCost: number;
}

export const POWER_CATALOG: readonly PowerDefinition[] = [
  {
    id: "freeze",
    displayName: "Freeze Time",
    icon: "❄",
    maxCharges: DEFAULT_POWER_MAX,
    coinCost: POWER_CHARGE_COIN_COST,
    rewardedAd: true,
    consumesCharge: true,
    storefront: true,
    energyCost: ENERGY_FREEZE,
  },
  {
    id: "timeshift",
    displayName: "Time Shift",
    icon: "⏱",
    maxCharges: DEFAULT_POWER_MAX,
    coinCost: POWER_CHARGE_COIN_COST,
    rewardedAd: true,
    consumesCharge: true,
    storefront: true,
    energyCost: ENERGY_TIMESHIFT,
  },
  {
    id: "rewind",
    displayName: "Rewind",
    icon: "↺",
    maxCharges: DEFAULT_POWER_MAX,
    coinCost: 90,
    rewardedAd: false,
    consumesCharge: false,
    storefront: false,
    energyCost: ENERGY_REWIND,
  },
];

const byId = new Map(POWER_CATALOG.map((power) => [power.id, power]));

export function powerById(id: string, catalog: readonly PowerDefinition[] = POWER_CATALOG): PowerDefinition | undefined {
  if (catalog === POWER_CATALOG) return byId.get(id);
  return catalog.find((power) => power.id === id);
}

export function storefrontPowers(catalog: readonly PowerDefinition[] = POWER_CATALOG): PowerDefinition[] {
  return catalog.filter((power) => power.storefront);
}

export function powerConsumesCharge(id: string, catalog: readonly PowerDefinition[] = POWER_CATALOG): boolean {
  return Boolean(powerById(id, catalog)?.consumesCharge);
}

export function powerMaxCharges(id: string, catalog: readonly PowerDefinition[] = POWER_CATALOG): number {
  return powerById(id, catalog)?.maxCharges ?? DEFAULT_POWER_MAX;
}

export function isKnownPowerId(id: string): id is PowerId {
  return id === "freeze" || id === "timeshift" || id === "rewind" || id === "burst" || id === "megaStrike";
}
