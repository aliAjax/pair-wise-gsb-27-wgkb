<script setup lang="ts">
/** 页面层：按 客户/线路/月份 的累计吨位核对、各批金额、结算入口 */
import { computed, ref } from "vue";
import type { GroupSummary, ShipmentBatch } from "../data/types";
import { useSettlementStore } from "../store/settlement";
import { tierProgress } from "../pricing/tiered";
import { discountText, kg, m3, tons, yuan } from "../utils/format";

const store = useSettlementStore();

const keyword = ref("");
const onlyPending = ref(false);

const filteredGroups = computed(() => {
  const kw = keyword.value.trim();
  return store.groups.filter((g) => {
    if (onlyPending.value && g.pendingDiffTotal === 0) return false;
    if (!kw) return true;
    return g.customer.includes(kw) || g.route.includes(kw) || g.month.includes(kw);
  });
});

function tierOf(group: GroupSummary) {
  return tierProgress(group.totalTons);
}

/** 一批内部用于展示的“此前累计”（跨档核对用） */
function priorTonsBefore(group: GroupSummary, batch: ShipmentBatch): number {
  let sum = 0;
  for (const b of group.batches) {
    if (b.id === batch.id) break;
    sum += b.billableKg / 1000;
  }
  return Math.round(sum * 1000) / 1000;
}

const settling = ref<ShipmentBatch | null>(null);
const collectedInput = ref(0);

function openSettle(batch: ShipmentBatch) {
  settling.value = batch;
  collectedInput.value = batch.trialAmount;
}

function confirmSettle() {
  if (!settling.value) return;
  store.settleBatch(settling.value.id, Number(collectedInput.value) || 0);
  settling.value = null;
}

const settleDiff = computed(() => {
  if (!settling.value) return 0;
  return Math.round((collectedInput.value - settling.value.trialAmount) * 100) / 100;
});

function diffOf(batch: ShipmentBatch) {
  return store.findDiffByBatch(batch.id);
}
</script>

<template>
  <section class="panel groups-panel">
    <div class="toolbar">
      <h2>本月累计核对</h2>
      <div class="toolbar-controls">
        <label class="inline-check">
          <input v-model="onlyPending" type="checkbox" />
          仅看待确认差额
        </label>
        <input v-model="keyword" class="search" type="search" placeholder="搜客户 / 线路 / 月份" />
      </div>
    </div>

    <div v-if="filteredGroups.length === 0" class="empty">暂无匹配的累计分组</div>

    <div v-for="group in filteredGroups" :key="group.key" class="group-card">
      <header class="group-head">
        <div>
          <p class="group-title">{{ group.customer }} <span class="arrow">/</span> {{ group.route }}</p>
          <p class="group-month">{{ group.month }} · {{ group.batches.length }} 批 · 已结算 {{ group.settledCount }} 批</p>
        </div>
        <div class="group-total">
          <span>累计计费吨位</span>
          <strong :class="tierOf(group).discount < 1 ? 'discounted' : ''">{{ tons(group.totalTons) }}</strong>
          <em :class="`tier-tag tier-${tierOf(group).discount === 1 ? 'base' : tierOf(group).discount === 0.97 ? 'mid' : 'top'}`">
            当前档位：{{ tierOf(group).label }}（{{ discountText(tierOf(group).discount) }}）
          </em>
        </div>
      </header>

      <div class="tier-track">
        <div class="tier-seg" :class="{ on: group.totalTons > 0 }">0–50吨 原价</div>
        <div class="tier-seg" :class="{ on: group.totalTons > 50 }">50–100吨 97折</div>
        <div class="tier-seg" :class="{ on: group.totalTons > 100 }">100吨以上 94折</div>
      </div>

      <table class="batch-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>服务</th>
            <th>实重</th>
            <th>体积</th>
            <th>计费吨</th>
            <th>批前累计</th>
            <th>拆段金额</th>
            <th>试算金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="batch in group.batches" :key="batch.id" :class="{ settled: batch.settled }" :title="batch.notes || ''">
            <td>{{ batch.date.slice(5) }}</td>
            <td>
              {{ batch.service }}
              <span v-if="batch.service === '冷链'" class="cold-tag">+15%</span>
            </td>
            <td>{{ kg(batch.weightKg) }}</td>
            <td>{{ m3(batch.volumeM3) }}</td>
            <td>{{ tons(batch.billableKg / 1000) }}</td>
            <td>{{ tons(priorTonsBefore(group, batch)) }}</td>
            <td class="seg-cell">
              <span v-for="(seg, i) in batch.segments" :key="i" class="seg-chip" :title="`${seg.label}：${discountText(seg.discount)}`">
                {{ seg.tons }}吨 ×{{ seg.discount }}＝{{ yuan(seg.amount) }}
              </span>
            </td>
            <td class="amount">{{ yuan(batch.trialAmount) }}</td>
            <td>
              <span v-if="batch.settled" class="status settled">已结算</span>
              <span v-else class="status unpaid">未结算</span>
              <span v-if="diffOf(batch) && !diffOf(batch)!.confirmed" class="status pending">差额待确认</span>
              <span v-else-if="diffOf(batch) && diffOf(batch)!.confirmed" class="status done">差额已确认</span>
            </td>
            <td class="ops">
              <button v-if="!batch.settled" type="button" class="mini" @click="openSettle(batch)">结算</button>
              <button type="button" class="mini danger" @click="store.removeBatch(batch.id)">删除</button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7">合计试算金额</td>
            <td class="amount">{{ yuan(group.trialTotal) }}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      <div v-if="group.pendingDiffTotal !== 0" class="group-pending">
        本组未确认差额合计：
        <strong :class="group.pendingDiffTotal > 0 ? 'refund' : 'charge'">
          {{ group.pendingDiffTotal > 0 ? "应退 " : "应补 " }}{{ yuan(Math.abs(group.pendingDiffTotal)) }}
        </strong>
      </div>
    </div>

    <!-- 结算弹层：已结算批次不改价，差额留待确认 -->
    <div v-if="settling" class="modal-mask" @click.self="settling = null">
      <div class="modal">
        <h3>结算批次（{{ settling.date }}）</h3>
        <p class="modal-sub">{{ settling.customer }} / {{ settling.route }} · 阶梯试算价 {{ yuan(settling.trialAmount) }}</p>
        <label>
          实际结算金额 (元)
          <input v-model.number="collectedInput" type="number" min="0" step="0.01" />
        </label>
        <p v-if="settleDiff === 0" class="diff-zero">按试算价结算，不产生差额。</p>
        <p v-else :class="['diff-warn', settleDiff > 0 ? 'refund' : 'charge']">
          {{ settleDiff > 0
            ? `实收比试算多 ${yuan(settleDiff)}，登记应退客户差额`
            : `实收比试算少 ${yuan(-settleDiff)}，登记应补收差额` }}
        </p>
        <p class="modal-note">已结算批次此后不再改价，差额进入“待确认差额”列表。</p>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" @click="settling = null">取消</button>
          <button type="button" class="primary-btn" @click="confirmSettle">确认结算</button>
        </div>
      </div>
    </div>
  </section>
</template>
