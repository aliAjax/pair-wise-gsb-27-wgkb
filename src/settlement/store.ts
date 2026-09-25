// 状态层：按「客户 + 线路 + 月份」逐边累计。
// 在途批次的价格段始终按当前累计实时重拆；已结算批次冻结原价/原拆分，
// 不因后续累计越档而改价，理论金额与已结算金额的差作为待确认差额。

import { computed, reactive } from "vue";
import { defineStore } from "pinia";
import {
  Adjustment,
  Batch,
  BatchStatus,
  PriceSegment,
  ServiceType,
  SettlementState
} from "./types";
import {
  batchAmount,
  chargeableWeightKg,
  round2,
  splitByTiers
} from "./pricing";
import { loadState, newAdjustmentId, saveState, clearState, seedState } from "./storage";

export interface BatchView {
  batch: Batch;
  month: string;
  chargeableKg: number;
  /** 结算后冻结的金额；在途为当前实时拆分金额 */
  amount: number;
  segments: PriceSegment[];
  /** 已结算批次按当前阶梯理论重算的金额 */
  currentAmount: number;
  /** 当前理论金额 - 已结算金额（负数表示应退客户） */
  difference: number;
  pending: boolean;
  priorKg: number;
  cumulativeKg: number;
}

export interface GroupView {
  key: string;
  customer: string;
  route: string;
  month: string;
  batches: BatchView[];
  cumulativeKg: number;
  settledAmount: number;
  inTransitAmount: number;
  /** 尚未确认的差额合计（负数为应退客户） */
  pendingDifference: number;
  confirmedDifference: number;
}

export interface NewBatchInput {
  customer: string;
  route: string;
  shipDate: string;
  weightKg: number;
  volumeM3: number;
  service: ServiceType;
  ratePerTon: number;
  notes: string;
}

function monthOf(shipDate: string): string {
  return shipDate.slice(0, 7);
}

/** 同组内排序：发货日期在前的先累计，同日按创建时间 */
function orderKey(batch: Batch): string {
  return `${batch.shipDate}T${batch.createdAt}`;
}

export const useSettlementStore = defineStore("settlement", () => {
  const state = reactive<SettlementState>(loadState());

  function persist() {
    saveState(state);
  }

  function evaluateGroup(customer: string, route: string, month: string): GroupView {
    const members = state.batches
      .filter(
        (batch) =>
          batch.customer === customer && batch.route === route && monthOf(batch.shipDate) === month
      )
      .sort((a, b) => orderKey(a).localeCompare(orderKey(b)));

    let cursorKg = 0;
    let settledAmount = 0;
    let inTransitAmount = 0;
    let pendingDifference = 0;
    let confirmedDifference = 0;

    const views: BatchView[] = members.map((batch) => {
      const priorKg = cursorKg;
      const chargeableKg = chargeableWeightKg(batch.weightKg, batch.volumeM3);
      const liveSegments = splitByTiers(
        cursorKg,
        chargeableKg,
        batch.ratePerTon,
        batch.service
      );

      let segments: PriceSegment[];
      let amount: number;
      let currentAmount: number;
      let difference: number;
      let pending: boolean;

      if (batch.status === "已结算") {
        // 已结算批次冻结：展示与合计都用保存下来的价格段
        segments = batch.segments.length ? batch.segments : liveSegments;
        amount = batchAmount(segments);
        currentAmount = batchAmount(liveSegments);
        difference = round2(currentAmount - amount);
        const confirmed = state.confirmedDiffs?.[batch.id];
        pending = difference !== 0 && confirmed !== difference;
        if (pending) pendingDifference = round2(pendingDifference + difference);
        if (confirmed !== undefined && confirmed !== 0) {
          confirmedDifference = round2(confirmedDifference + confirmed);
        }
        settledAmount = round2(settledAmount + amount);
      } else {
        // 在途：尚未结算，随累计变化实时重拆，不存在改价问题
        segments = liveSegments;
        amount = batchAmount(segments);
        currentAmount = amount;
        difference = 0;
        pending = false;
        inTransitAmount = round2(inTransitAmount + amount);
      }

      cursorKg = round2(cursorKg + chargeableKg);

      return {
        batch,
        month,
        chargeableKg: round2(chargeableKg),
        amount,
        segments,
        currentAmount,
        difference,
        pending,
        priorKg: round2(priorKg),
        cumulativeKg: cursorKg
      };
    });

    return {
      key: `${customer}|${route}|${month}`,
      customer,
      route,
      month,
      batches: views,
      cumulativeKg: cursorKg,
      settledAmount,
      inTransitAmount,
      pendingDifference,
      confirmedDifference
    };
  }

  const groups = computed<GroupView[]>(() => {
    const keys = new Set(
      state.batches.map((batch) => `${batch.customer}|${batch.route}|${monthOf(batch.shipDate)}`)
    );
    return [...keys]
      .map((key) => {
        const [customer, route, month] = key.split("|");
        return evaluateGroup(customer, route, month);
      })
      .sort((a, b) => b.month.localeCompare(a.month) || a.customer.localeCompare(b.customer));
  });

  const customers = computed(() => [...new Set(state.batches.map((b) => b.customer))].sort());
  const routes = computed(() => [...new Set(state.batches.map((b) => b.route))].sort());
  const adjustments = computed(() =>
    [...state.adjustments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );

  function addBatch(input: NewBatchInput): Batch {
    const month = monthOf(input.shipDate);
    const group = evaluateGroup(input.customer, input.route, month);
    const priorKg = group.cumulativeKg;
    const chargeableKg = chargeableWeightKg(input.weightKg, input.volumeM3);

    const batch: Batch = {
      id: crypto.randomUUID(),
      customer: input.customer.trim(),
      route: input.route.trim(),
      shipDate: input.shipDate,
      weightKg: input.weightKg,
      volumeM3: input.volumeM3,
      service: input.service,
      ratePerTon: input.ratePerTon,
      notes: input.notes.trim(),
      status: "在途",
      segments: splitByTiers(priorKg, chargeableKg, input.ratePerTon, input.service),
      createdAt: new Date().toISOString()
    };
    state.batches.push(batch);
    persist();
    return batch;
  }

  /** 结算在途批次：把当前实时拆分冻结为结算价格段，之后不再改价 */
  function settle(batchId: string) {
    const batch = state.batches.find((item) => item.id === batchId);
    if (!batch || batch.status === "已结算") return;
    const group = evaluateGroup(batch.customer, batch.route, monthOf(batch.shipDate));
    const view = group.batches.find((item) => item.batch.id === batchId);
    if (!view) return;
    batch.status = "已结算" as BatchStatus;
    batch.segments = view.segments.map((segment) => ({ ...segment }));
    batch.flat = 0;
    batch.settledAt = new Date().toISOString();
    persist();
  }

  function removeBatch(batchId: string) {
    const index = state.batches.findIndex((item) => item.id === batchId);
    if (index === -1) return;
    state.batches.splice(index, 1);
    persist();
  }

  /**
   * 确认一组客户+线路+月份下所有待确认差额：
   * 只登记确认记录并标记，已结算批次的价格段保持不动。
   */
  function confirmGroup(groupKey: string, note = "") {
    const group = groups.value.find((item) => item.key === groupKey);
    if (!group || group.pendingDifference === 0) return;

    for (const view of group.batches) {
      if (view.pending) {
        state.confirmedDiffs[view.batch.id] = view.difference;
      }
    }

    const adjustment: Adjustment = {
      id: newAdjustmentId(),
      customer: group.customer,
      route: group.route,
      month: group.month,
      amount: group.pendingDifference,
      note:
        note.trim() ||
        `按现行阶梯核对已结算批次差额 ${group.pendingDifference.toFixed(2)} 元（负为应退客户）`,
      createdAt: new Date().toISOString()
    };
    state.adjustments.push(adjustment);
    persist();
  }

  function resetAll() {
    const fresh = seedState();
    state.batches.splice(0, state.batches.length, ...fresh.batches);
    state.adjustments.splice(0, state.adjustments.length, ...fresh.adjustments);
    state.confirmedDiffs = {};
    persist();
  }

  function clearAll() {
    state.batches.splice(0, state.batches.length);
    state.adjustments.splice(0, state.adjustments.length);
    state.confirmedDiffs = {};
    clearState();
  }

  return {
    groups,
    customers,
    routes,
    adjustments,
    addBatch,
    settle,
    removeBatch,
    confirmGroup,
    resetAll,
    clearAll
  };
});
