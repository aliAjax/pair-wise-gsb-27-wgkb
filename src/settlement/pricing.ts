// 阶梯计价层：纯函数。负责体积折重、冷链加价、按本月累计重量跨档拆分。
// 不依赖 Vue、localStorage，输入确定则输出确定，方便单独核对。

import {
  COLD_CHAIN_SURCHARGE,
  PRICE_TIERS,
  PriceSegment,
  ServiceType,
  VOLUME_FACTOR_KG_PER_M3
} from "./types";

export const KG_PER_TON = 1000;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 体积每立方米折 200 公斤，实重与体积折算重量取大值作为计费重量 */
export function chargeableWeightKg(weightKg: number, volumeM3: number): number {
  return Math.max(weightKg, volumeM3 * VOLUME_FACTOR_KG_PER_M3);
}

/** 冷链在单价基础上加 15%，其余服务原价 */
export function effectiveRatePerTon(ratePerTon: number, service: ServiceType): number {
  const factor = service === "冷链" ? 1 + COLD_CHAIN_SURCHARGE : 1;
  return round2(ratePerTon * factor);
}

function tierAt(accumulatedTon: number): number {
  const index = PRICE_TIERS.findIndex(
    (tier) => accumulatedTon >= tier.fromTon && (tier.toTon === null || accumulatedTon < tier.toTon)
  );
  return index === -1 ? PRICE_TIERS.length - 1 : index;
}

/**
 * 按「批次发货前的本月累计吨数」把本批重量逐边拆分到阶梯各档。
 *
 * @param priorWeightKg 同一客户+线路、本月且发货时间更早的批次计费重量合计
 * @param batchWeightKg 本批计费重量
 * @param ratePerTon    与客户约定的线路原价（元/吨）
 * @param service       服务类型（冷链单价加 15%）
 *
 * 例：已累计 45 吨，本批 20 吨 → 前 5 吨原价、接下来 50 吨 97 折中用掉 15 吨。
 */
export function splitByTiers(
  priorWeightKg: number,
  batchWeightKg: number,
  ratePerTon: number,
  service: ServiceType
): PriceSegment[] {
  const rate = effectiveRatePerTon(ratePerTon, service);
  const segments: PriceSegment[] = [];
  let cursorKg = Math.max(0, priorWeightKg);
  let remainKg = Math.max(0, batchWeightKg);

  while (remainKg > 0) {
    const cursorTon = cursorKg / KG_PER_TON;
    const tierIndex = tierAt(cursorTon);
    const tier = PRICE_TIERS[tierIndex];
    const tierEndKg = tier.toTon === null ? Infinity : tier.toTon * KG_PER_TON;
    const pieceKg = Math.min(remainKg, tierEndKg - cursorKg);

    if (pieceKg > 0) {
      segments.push({
        tier: tierIndex,
        weightKg: round2(pieceKg),
        effectiveRatePerTon: rate,
        discount: tier.discount,
        amount: round2((pieceKg / KG_PER_TON) * rate * tier.discount)
      });
      cursorKg += pieceKg;
      remainKg -= pieceKg;
    } else {
      // 理论上不会发生，防御性退出避免死循环
      break;
    }
  }

  return segments;
}

export function batchAmount(segments: PriceSegment[]): number {
  return round2(segments.reduce((sum, segment) => sum + segment.amount, 0));
}

/** 若按当前阶梯重算这批（已结算批次不会真的改价），可得出理论金额与差额 */
export function retrialDifference(
  priorWeightKg: number,
  batchWeightKg: number,
  ratePerTon: number,
  service: ServiceType,
  settledSegments: PriceSegment[]
): { currentAmount: number; settledAmount: number; difference: number } {
  const currentSegments = splitByTiers(priorWeightKg, batchWeightKg, ratePerTon, service);
  const currentAmount = batchAmount(currentSegments);
  const settledAmount = batchAmount(settledSegments);
  return {
    currentAmount,
    settledAmount,
    difference: round2(currentAmount - settledAmount)
  };
}
