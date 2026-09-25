<script setup lang="ts">
// 页面-客户+线路+月度分组：核对累计吨位、各批金额、待确认差额。
import { ref } from "vue";
import { GroupView, useSettlementStore } from "../store";
import BatchCard from "./BatchCard.vue";
import { formatMoney, formatTon, signedMoney } from "../format";

const props = defineProps<{ group: GroupView }>();
const store = useSettlementStore();
const showConfirm = ref(false);
const confirmNote = ref("");

const tons = () => props.group.cumulativeKg / 1000;

// 各档在进度条上的实际占比：以当前累计吨位为 100%
function widthOf(tier: 0 | 1 | 2): string {
  const total = tons();
  if (total <= 0) return "0%";
  const inTier =
    tier === 0
      ? Math.min(total, 50)
      : tier === 1
        ? Math.min(50, Math.max(0, total - 50))
        : Math.max(0, total - 100);
  return `${(inTier / total) * 100}%`;
}

function settle(id: string) {
  if (window.confirm("结算后该批金额将冻结，之后累计越档也不会改价，只会生成待确认差额。继续？")) {
    store.settle(id);
  }
}

function remove(id: string) {
  if (window.confirm("删除后该客户+线路本月累计会重新计算，确定删除？")) {
    store.removeBatch(id);
  }
}

function confirmDifference() {
  store.confirmGroup(props.group.key, confirmNote.value);
  showConfirm.value = false;
  confirmNote.value = "";
}
</script>

<template>
  <article class="group">
    <header class="group-head">
      <div>
        <h3>{{ group.customer }} <span class="route">{{ group.route }}</span></h3>
        <p class="month">{{ group.month }} 月度累计</p>
      </div>
      <div class="group-total">
        <span>累计吨位</span>
        <strong>{{ formatTon(group.cumulativeKg) }}</strong>
      </div>
    </header>

    <div class="ladder">
      <div class="ladder-track">
        <div class="ladder-fill tier-fill-0" :style="{ width: widthOf(0) }" />
        <div class="ladder-fill tier-fill-1" :style="{ width: widthOf(1) }" />
        <div class="ladder-fill tier-fill-2" :style="{ width: widthOf(2) }" />
      </div>
      <div class="ladder-marks">
        <span :class="{ on: tons() <= 50 }">0–50吨 原价</span>
        <span :class="{ on: tons() > 50 && tons() <= 100 }">50–100吨 降3%</span>
        <span :class="{ on: tons() > 100 }">100吨以上 降6%</span>
      </div>
    </div>

    <div class="batch-list">
      <BatchCard
        v-for="view in group.batches"
        :key="view.batch.id"
        :view="view"
        @settle="settle"
        @remove="remove"
      />
    </div>

    <footer class="group-foot">
      <div class="sum-line">
        <span>已结算金额（冻结不改价）<strong>{{ formatMoney(group.settledAmount) }}</strong></span>
        <span>在途批次试算<strong>{{ formatMoney(group.inTransitAmount) }}</strong></span>
      </div>
      <div
        v-if="group.pendingDifference !== 0"
        class="pending-box"
        :class="group.pendingDifference < 0 ? 'refund' : 'surcharge'"
      >
        <p>
          待确认差额合计 <strong>{{ signedMoney(group.pendingDifference) }}</strong>
          （{{ group.pendingDifference < 0 ? '应退客户' : '应补收' }}）
        </p>
        <button v-if="!showConfirm" type="button" class="secondary" @click="showConfirm = true">
          确认差额
        </button>
        <div v-else class="confirm-row">
          <input v-model="confirmNote" placeholder="确认说明（可选）" />
          <button type="button" @click="confirmDifference">提交确认</button>
          <button type="button" class="secondary" @click="showConfirm = false">取消</button>
        </div>
      </div>
      <p v-else-if="group.confirmedDifference !== 0" class="confirmed-line">
        本月已确认差额 {{ signedMoney(group.confirmedDifference) }}
      </p>
    </footer>
  </article>
</template>
