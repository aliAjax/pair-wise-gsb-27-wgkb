/** 保存层：localStorage 读写，重开页面后数据与累计吨位可完整恢复 */
import {
  STORAGE_KEY,
  buildSeedBatches,
  buildSeedPendingDiffs
} from "../data/constants";
import type { PendingDiff, ShipmentBatch } from "../data/types";
import { priceBatch } from "../pricing/tiered";

export interface PersistState {
  version: number;
  batches: ShipmentBatch[];
  pendingDiffs: PendingDiff[];
}

const CURRENT_VERSION = 1;

function seedState(): PersistState {
  const batches = buildSeedBatches((draft, priorTons) => priceBatch(draft, priorTons));
  return { version: CURRENT_VERSION, batches, pendingDiffs: buildSeedPendingDiffs(batches) };
}

/** 读取本地数据；无记录时写入并返回内置演示数据 */
export function loadState(): PersistState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedState();
    saveState(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as PersistState;
    if (!Array.isArray(parsed.batches) || !Array.isArray(parsed.pendingDiffs)) {
      return seedState();
    }
    return {
      version: parsed.version ?? CURRENT_VERSION,
      batches: parsed.batches,
      pendingDiffs: parsed.pendingDiffs
    };
  } catch {
    return seedState();
  }
}

export function saveState(state: PersistState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** 恢复出厂演示数据 */
export function resetState(): PersistState {
  const seeded = seedState();
  saveState(seeded);
  return seeded;
}

export function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
