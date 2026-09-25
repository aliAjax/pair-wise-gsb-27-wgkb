<script setup lang="ts">
/** 页面层：待确认差额列表（已结算批次不改价，差额单独核销） */
import { computed, ref } from "vue";
import { useSettlementStore } from "../store/settlement";
import { yuan } from "../utils/format";

const store = useSettlementStore();
const tab = ref<"pending" | "confirmed">("pending");

const list = computed(() => (tab.value === "pending" ? store.unconfirmedDiffs : store.confirmedDiffs));

const pendingTotal = computed(() =>
  store.unconfirmedDiffs.reduce((sum, d) => sum + d.diffAmount, 0)
);
</script>

<template>
  <section class="panel diffs-panel">
    <div class="toolbar">
      <h2>待确认差额</h2>
      <div class="tab-buttons">
        <button type="button" :class="{ active: tab === 'pending' }" @click="tab = 'pending'">
          待确认 {{ store.pendingDiffCount }}
        </button>
        <button type="button" :class="{ active: tab === 'confirmed' }" @click="tab = 'confirmed'">
          已确认 {{ store.confirmedDiffs.length }}
        </button>
      </div>
    </div>

    <p class="diff-rule">
      已结算批次不再改价；实收金额与阶梯试算价的差额在此登记：
      <b class="refund">正数应退客户</b>，<b class="charge">负数应补收</b>。确认后只核销差额，不动历史批次。
    </p>

    <div v-if="tab === 'pending' && store.unconfirmedDiffs.length > 0" class="diff-summary">
      未确认净额：
      <strong :class="pendingTotal > 0 ? 'refund' : pendingTotal < 0 ? 'charge' : ''">
        {{ pendingTotal > 0 ? "应退 " : pendingTotal < 0 ? "应补 " : "" }}{{ yuan(Math.abs(pendingTotal)) }}
      </strong>
    </div>

    <div v-if="list.length === 0" class="empty">
      {{ tab === "pending" ? "没有待确认的差额" : "还没有确认过差额" }}
    </div>

    <ul v-else class="diff-list">
      <li v-for="d in list" :key="d.id" :class="{ confirmed: d.confirmed }">
        <div class="diff-main">
          <p class="diff-title">{{ d.customer }} / {{ d.route }} <span class="diff-month">{{ d.month }}</span></p>
          <p class="diff-calc">
            已结算 {{ yuan(d.settledAmount) }} － 阶梯试算 {{ yuan(d.trialAmount) }}
          </p>
          <p v-if="d.confirmed && d.confirmedAt" class="diff-time">
            已于 {{ new Date(d.confirmedAt).toLocaleString("zh-CN") }} 确认
          </p>
        </div>
        <strong class="diff-amount" :class="d.diffAmount > 0 ? 'refund' : 'charge'">
          {{ d.diffAmount > 0 ? "+" : "" }}{{ yuan(d.diffAmount) }}
        </strong>
        <button v-if="!d.confirmed" type="button" class="mini" @click="store.confirmDiff(d.id)">确认核销</button>
      </li>
    </ul>
  </section>
</template>
