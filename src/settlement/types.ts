// 资料层：分批结算的数据结构与固定规则，不做任何计算或读写。

export type ServiceType = "标准达" | "次日达" | "冷链";

export type BatchStatus = "在途" | "已结算";

/** 价格段（跨档批次被拆成的一段金额） */
export interface PriceSegment {
  /** 阶梯档次：0=前50吨原价，1=50~100吨，2=超过100吨 */
  tier: number;
  /** 本段落在哪一档次的重量（kg） */
  weightKg: number;
  /** 不含折扣的实际单价（元/吨，已含冷链加价） */
  effectiveRatePerTon: number;
  /** 折扣比例：1=原价，0.97=降3%，0.94=降6% */
  discount: number;
  /** 该段金额（元，保留两位小数） */
  amount: number;
}

/** 一次发货批次 */
export interface Batch {
  id: string;
  customer: string;
  route: string;
  /** 发货日期 YYYY-MM-DD，决定归属月份 */
  shipDate: string;
  /** 实重 kg */
  weightKg: number;
  /** 体积 m³（每立方米折算 200kg） */
  volumeM3: number;
  /** 服务类型，冷链在单价基础上加 15% */
  service: ServiceType;
  /** 与客户约定的线路单价（元/吨，原价，未折扣） */
  ratePerTon: number;
  notes: string;
  status: BatchStatus;
  /** 逐边累计拆分的价格段；flat=1 的历史批次整段按原价结算 */
  segments: PriceSegment[];
  /** 历史整批原价批次标记（累计越过阶梯后不再回头改价的批次） */
  flat?: 0 | 1;
  createdAt: string;
  settledAt?: string;
}

/** 差额确认记录（对已结算批次补/退的确认） */
export interface Adjustment {
  id: string;
  customer: string;
  route: string;
  month: string;
  /** 确认金额（元），正数为应退客户的差额 */
  amount: number;
  note: string;
  createdAt: string;
}

export interface SettlementState {
  batches: Batch[];
  adjustments: Adjustment[];
  /** 已确认过的差额：批次ID -> 确认时的差额（批次本身价格段不动） */
  confirmedDiffs: Record<string, number>;
}

// ---- 固定规则 ----

/** 体积折算重量：每立方米折合公斤数 */
export const VOLUME_FACTOR_KG_PER_M3 = 200;

/** 冷链在单价基础上的加价比例 */
export const COLD_CHAIN_SURCHARGE = 0.15;

export interface PriceTier {
  /** 档次名称 */
  label: string;
  /** 区间起点（累计吨，含） */
  fromTon: number;
  /** 区间终点（累计吨，不含；null 表示不限） */
  toTon: number | null;
  /** 折扣比例 */
  discount: number;
}

/** 月度累计重量阶梯（按客户 + 线路）：前50吨原价，50~100吨降3%，超过100吨降6% */
export const PRICE_TIERS: readonly PriceTier[] = [
  { label: "前50吨原价", fromTon: 0, toTon: 50, discount: 1 },
  { label: "50-100吨降3%", fromTon: 50, toTon: 100, discount: 0.97 },
  { label: "超100吨降6%", fromTon: 100, toTon: null, discount: 0.94 }
];

export const SERVICE_OPTIONS: readonly ServiceType[] = ["标准达", "次日达", "冷链"];
