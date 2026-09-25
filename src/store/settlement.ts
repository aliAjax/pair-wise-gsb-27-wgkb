/** 业务状态层：批次、待确认差额、按 客户/线路/月份 的累计与分组动作 */
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  BatchDraft,
  GroupSummary,
  PendingDiff,
  ShipmentBatch
} from "../data/types";
import { createId, loadState, resetState, saveState } from "../storage/local";
import { diffAmount, priceBatch } from "../pricing/tiered";
import { round2 } from "../data/constants";

export function groupKeyOf(customer: string, route: string, month: string): string {
  return `${customer.trim()}|${route.trim()}|${month}`;
}

export function batchGroupKey(batch: ShipmentBatch): string {
  return groupKeyOf(batch.customer, batch.route, batch.date.slice(0, 7));
}

/** 组内排序：先发货日期、再录入时间，保证跨档判定顺序稳定 */
function sortBatches(list: ShipmentBatch[]): ShipmentBatch[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export const useSettlementStore = defineStore("settlement", () => {
  const initial = loadState();
  const batches = ref<ShipmentBatch[]>(initial.batches);
  const pendingDiffs = ref<PendingDiff[]>(initial.pendingDiffs);

  function persist() {
    saveState({ version: 1, batches: batches.value, pendingDiffs: pendingDiffs.value });
  }

  /** 某组在指定日期之前（不含本批）的累计计费吨数 */
  function priorTons(customer: string, route: string, date: string): number {
    const month = date.slice(0, 7);
    const key = groupKeyOf(customer, route, month);
    const tons = batches.value
      .filter((b) => batchGroupKey(b) === key)
      .reduce((sum, b) => sum + b.billableKg / 1000, 0);
    return round2(tons);
  }

  /** 新增批次前的试算预览（拆段、冷链加价、金额） */
  function preview(draft: BatchDraft) {
    const prior = priorTons(draft.customer, draft.route, draft.date);
    const priced = priceBatch(draft, prior);
    return { priorTons: prior, afterTons: round2(prior + priced.billableKg / 1000), ...priced };
  }

  /** 录入一批发货并保存；勾选已结算时同步登记待确认差额 */
  function addBatch(draft: BatchDraft): ShipmentBatch {
    const result = preview(draft);
    const now = new Date().toISOString();
    const batch: ShipmentBatch = {
      ...result,
      id: createId(),
      createdAt: now
    };
    batches.value = [...batches.value, batch];

    if (batch.settled && batch.collectedAmount != null) {
      const diff = diffAmount(batch);
      if (diff !== 0) {
        pendingDiffs.value = [
          ...pendingDiffs.value,
          {
            id: createId(),
            batchId: batch.id,
            customer: batch.customer,
            route: batch.route,
            month: batch.date.slice(0, 7),
            settledAmount: batch.collectedAmount,
            trialAmount: batch.trialAmount,
            diffAmount: diff,
            confirmed: false,
            createdAt: now,
            confirmedAt: null
          }
        ];
      }
    }
    persist();
    return batch;
  }

  /** 对未结算批次做结算；已结算批次不改价，只按实收登记差额 */
  function settleBatch(id: string, collectedAmount: number) {
    const batch = batches.value.find((b) => b.id === id);
    if (!batch || batch.settled) return;
    const amount = round2(collectedAmount);
    batch.settled = true;
    batch.collectedAmount = amount;
    const diff = round2(amount - batch.trialAmount);
    if (diff !== 0) {
      pendingDiffs.value = [
        ...pendingDiffs.value,
        {
          id: createId(),
          batchId: batch.id,
          customer: batch.customer,
          route: batch.route,
          month: batch.date.slice(0, 7),
          settledAmount: amount,
          trialAmount: batch.trialAmount,
          diffAmount: diff,
          confirmed: false,
          createdAt: new Date().toISOString(),
          confirmedAt: null
        }
      ];
    }
    persist();
  }

  /** 确认（核销）一笔差额 */
  function confirmDiff(id: string) {
    const diff = pendingDiffs.value.find((d) => d.id === id);
    if (!diff || diff.confirmed) return;
    diff.confirmed = true;
    diff.confirmedAt = new Date().toISOString();
    persist();
  }

  function removeBatch(id: string) {
    batches.value = batches.value.filter((b) => b.id !== id);
    pendingDiffs.value = pendingDiffs.value.filter((d) => d.batchId !== id);
    persist();
  }

  function resetAll() {
    const seeded = resetState();
    batches.value = seeded.batches;
    pendingDiffs.value = seeded.pendingDiffs;
  }

  /** 按 客户 + 线路 + 月份 汇总，重开后用来核对累计吨位 */
  const groups = computed<GroupSummary[]>(() => {
    const map = new Map<string, GroupSummary>();
    for (const batch of sortBatches(batches.value)) {
      const key = batchGroupKey(batch);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          customer: batch.customer,
          route: batch.route,
          month: batch.date.slice(0, 7),
          batches: [],
          totalTons: 0,
          settledCount: 0,
          trialTotal: 0,
          pendingDiffTotal: 0
        };
        map.set(key, group);
      }
      group.batches.push(batch);
      group.totalTons = round2(group.totalTons + batch.billableKg / 1000);
      group.trialTotal = round2(group.trialTotal + batch.trialAmount);
      if (batch.settled) group.settledCount += 1;
    }
    // 写入每组未确认差额
    for (const diff of pendingDiffs.value) {
      if (diff.confirmed) continue;
      const key = groupKeyOf(diff.customer, diff.route, diff.month);
      const group = map.get(key);
      if (group) group.pendingDiffTotal = round2(group.pendingDiffTotal + diff.diffAmount);
    }
    return [...map.values()].sort((a, b) =>
      a.month === b.month
        ? a.customer === b.customer
          ? a.route.localeCompare(b.route)
          : a.customer.localeCompare(b.customer)
        : b.month.localeCompare(a.month)
    );
  });

  const unconfirmedDiffs = computed(() =>
    [...pendingDiffs.value]
      .filter((d) => !d.confirmed)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );

  const confirmedDiffs = computed(() =>
    pendingDiffs.value.filter((d) => d.confirmed)
  );

  const pendingDiffCount = computed(() => unconfirmedDiffs.value.length);

  const sortedBatches = computed(() => sortBatches(batches.value).reverse());

  function findDiffByBatch(batchId: string): PendingDiff | undefined {
    return pendingDiffs.value.find((d) => d.batchId === batchId);
  }

  return {
    batches,
    pendingDiffs,
    groups,
    sortedBatches,
    unconfirmedDiffs,
    confirmedDiffs,
    pendingDiffCount,
    preview,
    priorTons,
    addBatch,
    settleBatch,
    confirmDiff,
    removeBatch,
    resetAll,
    findDiffByBatch
  };
});
