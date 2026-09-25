<script setup lang="ts">
// 页面-新增批次表单：只负责采集输入与提交前试算，累计与拆段由 store/计价层完成。
import { computed, reactive } from "vue";
import { SERVICE_OPTIONS, ServiceType } from "../types";
import { useSettlementStore } from "../store";
import { chargeableWeightKg, splitByTiers, batchAmount } from "../pricing";
import { formatMoney, formatTon, discountText } from "../format";

const store = useSettlementStore();
const today = new Date().toISOString().slice(0, 10);

const form = reactive({
  customer: "",
  route: "",
  shipDate: today,
  weightKg: 0,
  volumeM3: 0,
  service: "标准达" as ServiceType,
  ratePerTon: 0,
  notes: ""
});

const chargeableKg = computed(() => chargeableWeightKg(form.weightKg || 0, form.volumeM3 || 0));

const previewGroup = computed(() =>
  store.groups.find(
    (group) =>
      group.customer === form.customer.trim() &&
      group.route === form.route.trim() &&
      group.month === form.shipDate.slice(0, 7)
  )
);

const previewSegments = computed(() => {
  if (!form.ratePerTon || chargeableKg.value <= 0) return [];
  return splitByTiers(
    previewGroup.value?.cumulativeKg ?? 0,
    chargeableKg.value,
    form.ratePerTon,
    form.service
  );
});

const previewAmount = computed(() => batchAmount(previewSegments.value));

const valid = computed(
  () =>
    form.customer.trim() !== "" &&
    form.route.trim() !== "" &&
    form.shipDate !== "" &&
    chargeableKg.value > 0 &&
    form.ratePerTon > 0
);

function submit() {
  if (!valid.value) return;
  store.addBatch({
    customer: form.customer,
    route: form.route,
    shipDate: form.shipDate,
    weightKg: Number(form.weightKg) || 0,
    volumeM3: Number(form.volumeM3) || 0,
    service: form.service,
    ratePerTon: Number(form.ratePerTon) || 0,
    notes: form.notes
  });
  form.notes = "";
  form.weightKg = 0;
  form.volumeM3 = 0;
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>新增发货批次</h2>
    <div class="form-grid">
      <label>
        客户名称
        <input v-model="form.customer" list="customer-options" placeholder="如：海沃商贸" required />
        <datalist id="customer-options">
          <option v-for="name in store.customers" :key="name" :value="name" />
        </datalist>
      </label>
      <label>
        运输线路
        <input v-model="form.route" list="route-options" placeholder="如：上海-南京" required />
        <datalist id="route-options">
          <option v-for="name in store.routes" :key="name" :value="name" />
        </datalist>
      </label>
      <label>
        发货日期
        <input v-model="form.shipDate" type="date" required />
      </label>
      <label>
        服务类型
        <select v-model="form.service">
          <option v-for="option in SERVICE_OPTIONS" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <label>
        实重 kg
        <input v-model.number="form.weightKg" type="number" min="0" step="1" required />
      </label>
      <label>
        体积 m³（每m³折200kg）
        <input v-model.number="form.volumeM3" type="number" min="0" step="0.1" />
      </label>
      <label>
        线路单价（元/吨，原价）
        <input v-model.number="form.ratePerTon" type="number" min="0" step="1" required />
      </label>
      <label>
        备注
        <textarea v-model="form.notes" placeholder="温区、装卸、现场说明等" />
      </label>

      <div class="preview" v-if="chargeableKg > 0">
        <p class="preview-row">
          <span>计费重量</span>
          <strong>{{ formatTon(chargeableKg) }}</strong>
        </p>
        <p class="preview-row" v-if="previewGroup">
          <span>本月此前累计</span>
          <strong>{{ formatTon(previewGroup.cumulativeKg) }}</strong>
        </p>
        <template v-if="previewSegments.length">
          <p
            v-for="(segment, index) in previewSegments"
            :key="index"
            class="preview-row segment"
          >
            <span>{{ formatTon(segment.weightKg) }} · {{ discountText(segment.discount) }}</span>
            <strong>{{ formatMoney(segment.amount) }}</strong>
          </p>
          <p class="preview-row total">
            <span>本批试算合计</span>
            <strong>{{ formatMoney(previewAmount) }}</strong>
          </p>
        </template>
      </div>

      <button type="submit" :disabled="!valid">登记批次（在途）</button>
      <p class="hint">批次先按「在途」登记，确认收货/对账后再结算冻结金额。</p>
    </div>
  </form>
</template>
