/** 资料层：分批结算用到的类型定义 */

/** 服务类型，冷链在运费上加 15% */
export type ServiceType = "标准达" | "次日达" | "冷链";

/** 阶梯档位（0~50 吨原价 / 50~100 吨降 3% / 100 吨以上降 6%） */
export interface Tier {
  /** 档位起始吨数（含） */
  startTons: number;
  /** 档位名称 */
  label: string;
  /** 折扣率，1 = 原价 */
  discount: number;
}

/** 跨档批次拆出的一段金额 */
export interface PriceSegment {
  /** 落在该档的计费吨数 */
  tons: number;
  /** 档位起始吨数 */
  startTons: number;
  /** 档位名称 */
  label: string;
  /** 折扣率 */
  discount: number;
  /** 该段金额（元，已含冷链加价） */
  amount: number;
}

/** 一批发货（一次分批结算记录） */
export interface ShipmentBatch {
  id: string;
  customer: string;
  route: string;
  /** 发货日期 YYYY-MM-DD，按其所在月份累计 */
  date: string;
  /** 实重 kg */
  weightKg: number;
  /** 体积 m³（每 m³ 折 200kg） */
  volumeM3: number;
  /** 计费重量 kg = max(实重, 体积 × 200) */
  billableKg: number;
  service: ServiceType;
  /** 基准单价 元/吨（折前、冷链加价钱） */
  unitPricePerTon: number;
  /** 跨档拆段后的试算金额明细 */
  segments: PriceSegment[];
  /** 按阶梯试算的应收金额（拆段合计） */
  trialAmount: number;
  /** 是否已结算 */
  settled: boolean;
  /** 已结算批次实际收的金额；与试算金额的差额留待确认 */
  collectedAmount: number | null;
  notes: string;
  createdAt: string;
}

/** 待确认差额（已结算批次实际价与阶梯价之差） */
export interface PendingDiff {
  id: string;
  batchId: string;
  customer: string;
  route: string;
  month: string;
  /** 已结算金额 */
  settledAmount: number;
  /** 阶梯试算金额 */
  trialAmount: number;
  /** 差额 = 已结算 - 试算；正数应退客户，负数应补收 */
  diffAmount: number;
  confirmed: boolean;
  createdAt: string;
  confirmedAt: string | null;
}

/** 新增批次时录入的原始资料 */
export interface BatchDraft {
  customer: string;
  route: string;
  date: string;
  weightKg: number;
  volumeM3: number;
  service: ServiceType;
  unitPricePerTon: number;
  /** 勾选“本批已结算”后可填实际已收金额 */
  settled: boolean;
  collectedAmount: number | null;
  notes: string;
}

/** 按 客户 + 线路 + 月份 的累计汇总 */
export interface GroupSummary {
  key: string;
  customer: string;
  route: string;
  month: string;
  batches: ShipmentBatch[];
  /** 本月累计计费吨数 */
  totalTons: number;
  /** 已结算批次数 */
  settledCount: number;
  /** 各批试算金额合计 */
  trialTotal: number;
  /** 未确认的待确认差额合计 */
  pendingDiffTotal: number;
}
