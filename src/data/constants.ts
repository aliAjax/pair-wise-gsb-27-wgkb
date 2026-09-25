/** 资料层：阶梯档位、换算规则与初始演示数据 */
import type { BatchDraft, PendingDiff, ServiceType, ShipmentBatch, Tier } from "./types";

/** 体积换算：1 m³ 折算 200 kg */
export const VOLUME_FACTOR_KG_PER_M3 = 200;

/** 冷链在折后运费上加 15% */
export const COLD_CHAIN_SURCHARGE = 0.15;

/** 阶梯折扣（按 客户 + 线路 的本月累计计费吨数判定） */
export const TIERS: readonly Tier[] = [
  { startTons: 0, label: "原价(0-50吨)", discount: 1 },
  { startTons: 50, label: "97折(50-100吨)", discount: 0.97 },
  { startTons: 100, label: "94折(100吨以上)", discount: 0.94 }
];

export const SERVICE_OPTIONS: readonly ServiceType[] = ["标准达", "次日达", "冷链"];

export const ROUTE_OPTIONS = ["上海-南京", "杭州-合肥", "广州-深圳", "北京-天津"] as const;
export const CUSTOMER_OPTIONS = ["海沃商贸", "云仓食品"] as const;

export const STORAGE_KEY = "hxwlfront-13-batch-settlement";

/** 初始演示批次：覆盖跨档已结算（留差额）与冷链再次跨档场景 */
const SEED_DRAFTS: ReadonlyArray<BatchDraft & { id: string; createdAt: string }> = [
  {
    id: "seed-1",
    customer: "海沃商贸",
    route: "上海-南京",
    date: seedDate(-6),
    weightKg: 55000,
    volumeM3: 100,
    service: "标准达",
    unitPricePerTon: 700,
    settled: true,
    collectedAmount: 38500,
    notes: "越过50吨档，当时按原价整体结算，差额待确认",
    createdAt: seedDateTime(-6)
  },
  {
    id: "seed-2",
    customer: "海沃商贸",
    route: "上海-南京",
    date: seedDate(-2),
    weightKg: 48000,
    volumeM3: 60,
    service: "冷链",
    unitPricePerTon: 700,
    settled: false,
    collectedAmount: null,
    notes: "冷链批次，跨100吨档拆两段",
    createdAt: seedDateTime(-2)
  }
];

/** 让种子数据落在“本月”：用当前年月拼固定日，重开后仍计入当月累计 */
function seedDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

function seedDateTime(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

export function buildSeedBatches(
  priceBatch: (draft: BatchDraft, priorTons: number) => Omit<ShipmentBatch, "id" | "createdAt">
): ShipmentBatch[] {
  const prior = new Map<string, number>();
  return SEED_DRAFTS.map((draft) => {
    const key = `${draft.customer}|${draft.route}|${draft.date.slice(0, 7)}`;
    const priorTons = prior.get(key) ?? 0;
    const priced = priceBatch(draft, priorTons);
    prior.set(key, priorTons + priced.billableKg / 1000);
    return { ...priced, id: draft.id, createdAt: String(draft.createdAt) };
  });
}

/** 首条种子已按原价收取，对应生成一笔待确认差额 */
export function buildSeedPendingDiffs(batches: ShipmentBatch[]): PendingDiff[] {
  return batches
    .filter((b) => b.settled && b.collectedAmount != null)
    .map((b) => {
      const diff = round2((b.collectedAmount ?? 0) - b.trialAmount);
      return {
        id: `seed-diff-${b.id}`,
        batchId: b.id,
        customer: b.customer,
        route: b.route,
        month: b.date.slice(0, 7),
        settledAmount: b.collectedAmount ?? 0,
        trialAmount: b.trialAmount,
        diffAmount: diff,
        confirmed: diff === 0,
        createdAt: b.createdAt,
        confirmedAt: diff === 0 ? b.createdAt : null
      };
    });
}

/** 金额保留两位小数 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
