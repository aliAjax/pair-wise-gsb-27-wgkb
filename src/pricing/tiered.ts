/** 阶梯计价层：计费重量、跨档拆段、差额均为纯函数，便于单独核对 */
import {
  COLD_CHAIN_SURCHARGE,
  TIERS,
  VOLUME_FACTOR_KG_PER_M3,
  round2
} from "../data/constants";
import type { BatchDraft, PriceSegment, ShipmentBatch } from "../data/types";

/** 计费重量 kg：实重与体积折算重量（1m³ = 200kg）取大 */
export function calcBillableKg(weightKg: number, volumeM3: number): number {
  const volumeWeightKg = Math.max(0, volumeM3) * VOLUME_FACTOR_KG_PER_M3;
  return Math.max(Math.max(0, weightKg), volumeWeightKg);
}

/** 累计吨数落在哪个档位（返回 TIERS 的下标） */
export function tierIndexAt(totalTons: number): number {
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (totalTons + 1e-9 >= TIERS[i].startTons) index = i;
  }
  return index;
}

/** 跨档拆段：本批从 priorTons 开始，把吨数切到经过的每个档位 */
export function splitSegments(
  priorTons: number,
  batchTons: number
): Array<Pick<PriceSegment, "tons" | "startTons" | "label" | "discount">> {
  const segments = [];
  let cursor = Math.max(0, priorTons);
  let remaining = Math.max(0, batchTons);
  let guard = 0;
  while (remaining > 1e-9 && guard < TIERS.length + 1) {
    guard += 1;
    const idx = tierIndexAt(cursor);
    const tier = TIERS[idx];
    const nextStart = TIERS[idx + 1]?.startTons ?? Infinity;
    // 当前 cursor 距下一档起点的容量（cursor 可能正压在档界上）
    const capacity = Math.max(0, nextStart - cursor);
    const tons = Math.min(remaining, capacity === 0 ? remaining : capacity);
    segments.push({
      tons: round2(tons),
      startTons: tier.startTons,
      label: tier.label,
      discount: tier.discount
    });
    cursor += tons;
    remaining -= tons;
  }
  return segments;
}

/**
 * 给一批货定价：
 * 段金额 = 段吨数 × 单价 × 档位折扣 ×（冷链 1.15）
 */
export function priceBatch(draft: BatchDraft, priorTons: number): Omit<ShipmentBatch, "id" | "createdAt"> {
  const billableKg = round2(calcBillableKg(draft.weightKg, draft.volumeM3));
  const batchTons = billableKg / 1000;
  const coldFactor = draft.service === "冷链" ? 1 + COLD_CHAIN_SURCHARGE : 1;

  const rawSegments = splitSegments(priorTons, batchTons);
  const segments: PriceSegment[] = rawSegments.map((seg) => ({
    ...seg,
    amount: round2(seg.tons * draft.unitPricePerTon * seg.discount * coldFactor)
  }));
  const trialAmount = round2(segments.reduce((sum, seg) => sum + seg.amount, 0));

  return {
    customer: draft.customer.trim(),
    route: draft.route.trim(),
    date: draft.date,
    weightKg: Math.max(0, draft.weightKg),
    volumeM3: Math.max(0, draft.volumeM3),
    billableKg,
    service: draft.service,
    unitPricePerTon: Math.max(0, draft.unitPricePerTon),
    segments,
    trialAmount,
    settled: draft.settled,
    collectedAmount: draft.settled ? round2(draft.collectedAmount ?? trialAmount) : null,
    notes: draft.notes.trim()
  };
}

/** 已结算批次与阶梯试算价的差额：正=应退客户，负=应补收 */
export function diffAmount(batch: ShipmentBatch): number {
  if (!batch.settled || batch.collectedAmount == null) return 0;
  return round2(batch.collectedAmount - batch.trialAmount);
}

/** 当前累计吨数所处档位的进度（供页面进度条使用） */
export function tierProgress(totalTons: number): { label: string; discount: number; nextInTons: number | null } {
  const idx = tierIndexAt(totalTons);
  const tier = TIERS[idx];
  const nextStart = TIERS[idx + 1]?.startTons ?? null;
  return {
    label: tier.label,
    discount: tier.discount,
    nextInTons: nextStart == null ? null : round2(Math.max(0, nextStart - totalTons))
  };
}
