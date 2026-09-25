// 保存层：localStorage 读写、演示数据、重开后的核对口径都在这里，
// 页面和计价逻辑不直接碰 localStorage。

import { Batch, PriceSegment, SettlementState } from "./types";
import { chargeableWeightKg, effectiveRatePerTon, round2 } from "./pricing";

const STORAGE_KEY = "hxwl-settlement-v1";

function flatSegment(batch: {
  weightKg: number;
  volumeM3: number;
  ratePerTon: number;
  service: Batch["service"];
}): PriceSegment {
  const weightKg = chargeableWeightKg(batch.weightKg, batch.volumeM3);
  const rate = effectiveRatePerTon(batch.ratePerTon, batch.service);
  return {
    tier: 0,
    weightKg: round2(weightKg),
    effectiveRatePerTon: rate,
    discount: 1,
    amount: round2((weightKg / 1000) * rate)
  };
}

function seedBatches(): Batch[] {
  const rows: Array<Omit<Batch, "segments" | "flat" | "createdAt"> & { flat?: 0 | 1 }> = [
    {
      id: "seed-a1",
      customer: "海沃商贸",
      route: "上海-南京",
      shipDate: "2026-09-02",
      weightKg: 80000,
      volumeM3: 20,
      service: "标准达",
      ratePerTon: 200,
      notes: "月初首批，按整批原价已结算",
      status: "已结算",
      settledAt: "2026-09-03T09:00:00.000Z"
    },
    {
      id: "seed-a2",
      customer: "海沃商贸",
      route: "上海-南京",
      shipDate: "2026-09-18",
      weightKg: 40000,
      volumeM3: 30,
      service: "标准达",
      ratePerTon: 200,
      notes: "跨100吨档，系统已拆两段计价",
      status: "在途"
    },
    {
      id: "seed-b1",
      customer: "云仓食品",
      route: "杭州-合肥",
      shipDate: "2026-09-05",
      weightKg: 12000,
      volumeM3: 10,
      service: "冷链",
      ratePerTon: 300,
      notes: "冷链单价已含15%加价，整批原价结算",
      status: "已结算",
      settledAt: "2026-09-06T09:00:00.000Z"
    },
    {
      id: "seed-b2",
      customer: "云仓食品",
      route: "杭州-合肥",
      shipDate: "2026-09-15",
      weightKg: 8000,
      volumeM3: 60,
      service: "冷链",
      ratePerTon: 300,
      notes: "体积折算12吨，大于实重8吨",
      status: "在途"
    },
    {
      id: "seed-b3",
      customer: "云仓食品",
      route: "杭州-合肥",
      shipDate: "2026-09-22",
      weightKg: 40000,
      volumeM3: 250,
      service: "冷链",
      ratePerTon: 300,
      notes: "体积折算50吨，跨50吨档拆两段",
      status: "在途"
    }
  ];

  return rows.map((row, index) => {
    const base: Batch = {
      ...row,
      flat: row.flat,
      segments: [],
      createdAt: new Date(Date.now() - (rows.length - index) * 3600000).toISOString()
    };
    if (row.status === "已结算") {
      base.flat = 1;
      base.segments = [flatSegment(row)];
    }
    return base;
  });
}

/** 给种子在途批次补算阶梯段（在 store 初始化时按顺序逐边累加） */
export function seedState(): SettlementState {
  return { batches: seedBatches(), adjustments: [], confirmedDiffs: {} };
}

export function loadState(): SettlementState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedState();
  try {
    const parsed = JSON.parse(raw) as SettlementState;
    if (!Array.isArray(parsed.batches) || !Array.isArray(parsed.adjustments)) {
      return seedState();
    }
    return {
      batches: parsed.batches,
      adjustments: parsed.adjustments,
      confirmedDiffs: parsed.confirmedDiffs ?? {}
    };
  } catch {
    return seedState();
  }
}

export function saveState(state: SettlementState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

let adjustmentSeq = 0;
export function newAdjustmentId(): string {
  adjustmentSeq += 1;
  return `adj-${Date.now()}-${adjustmentSeq}`;
}
