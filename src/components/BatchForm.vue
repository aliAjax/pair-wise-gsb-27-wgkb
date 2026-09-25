<script setup lang="ts">
/** 页面层：新增批次表单 + 实时拆段试算预览 */
import { computed, reactive, ref } from "vue";
import type { BatchDraft, ServiceType } from "../data/types";
import { CUSTOMER_OPTIONS, ROUTE_OPTIONS, SERVICE_OPTIONS, VOLUME_FACTOR_KG_PER_M3 } from "../data/constants";
import { useSettlementStore } from "../store/settlement";
import { tierProgress } from "../pricing/tiered";
import { discountText, kg, m3, tons, yuan } from "../utils/format";

const emit = defineEmits<{ saved: [] }>();

const store = useSettlementStore();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const form = reactive<BatchDraft>({
  customer: CUSTOMER_OPTIONS[0],
  route: ROUTE_OPTIONS[0],
  date: today(),
  weightKg: 0,
  volumeM3: 0,
  service: "标准达",
  unitPricePerTon: 700,
  settled: false,
  collectedAmount: null,
  notes: ""
});

const touched = ref(false);

const valid = computed(
  () =>
    form.customer.trim() !== "" &&
    form.route.trim() !== "" &&
    form.date !== "" &&
    form.weightKg >= 0 &&
    form.volumeM3 >= 0 &&
    preview.value.billableKg > 0 &&
    form.unitPricePerTon > 0 &&
    (!form.settled || (form.collectedAmount ?? 0) >= 0)
);

const preview = computed(() =>
  store.preview({
    customer: form.customer,
    route: form.route,
    date: form.date,
    weightKg: Number(form.weightKg) || 0,
    volumeM3: Number(form.volumeM3) || 0,
    service: form.service as ServiceType,
    unitPricePerTon: Number(form.unitPricePerTon) || 0,
    settled: form.settled,
    collectedAmount: form.collectedAmount,
    notes: form.notes
  })
);

const afterTier = computed(() => tierProgress(preview.value.afterTons));

const volumeWeightKg = computed(() => (Number(form.volumeM3) || 0) * VOLUME_FACTOR_KG_PER_M3);
const wouldDiff = computed(() => {
  if (!form.settled || form.collectedAmount == null) return 0;
  return Math.round(((form.collectedAmount ?? 0) - preview.value.trialAmount) * 100) / 100;
});

function resetForm() {
  Object.assign(form, {
    customer: CUSTOMER_OPTIONS[0],
    route: ROUTE_OPTIONS[0],
    date: today(),
    weightKg: 0,
    volumeM3: 0,
    service: "标准达",
    unitPricePerTon: 700,
    settled: false,
    collectedAmount: null,
    notes: ""
  });
  touched.value = false;
}

function submit() {
  touched.value = true;
  if (!valid.value) return;
  store.addBatch({
    ...form,
    weightKg: Number(form.weightKg) || 0,
    volumeM3: Number(form.volumeM3) || 0,
    unitPricePerTon: Number(form.unitPricePerTon) || 0,
    collectedAmount: form.settled ? Number(form.collectedAmount ?? preview.value.trialAmount) : null
  });
  resetForm();
  emit("saved");
}
</script>

<template>
  <form class="panel entry-form" @submit.prevent="submit">
    <h2>新增分批发货</h2>
    <p class="form-hint">按客户 + 线路记本月累计计费吨数，跨档批次自动拆段计价。</p>

    <div class="form-grid">
      <label>
        客户名称
        <select v-model="form.customer" required>
          <option v-for="c in CUSTOMER_OPTIONS" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>

      <label>
        运输线路
        <select v-model="form.route" required>
          <option v-for="r in ROUTE_OPTIONS" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>

      <label>
        发货日期
        <input v-model="form.date" type="date" required />
      </label>

      <label>
        服务类型
        <select v-model="form.service">
          <option v-for="s in SERVICE_OPTIONS" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>

      <label>
        实重 (kg)
        <input v-model.number="form.weightKg" type="number" min="0" step="0.1" required />
      </label>

      <label>
        体积 (m³)
        <input v-model.number="form.volumeM3" type="number" min="0" step="0.01" required />
      </label>

      <label>
        基准单价 (元/吨)
        <input v-model.number="form.unitPricePerTon" type="number" min="0" step="1" required />
      </label>

      <label class="span-2">
        备注
        <input v-model="form.notes" type="text" placeholder="可填温区、现场说明等" />
      </label>
    </div>

    <div class="preview-box">
      <header class="preview-head">
        <strong>试算预览</strong>
        <span :class="['tier-badge', `tier-${afterTier.discount === 1 ? 'base' : afterTier.discount === 0.97 ? 'mid' : 'top'}`]">
          累计后：{{ afterTier.label }}
        </span>
      </header>
      <ul class="kv">
        <li><span>体积折算重量</span><b>{{ m3(Number(form.volumeM3) || 0) }} × {{ VOLUME_FACTOR_KG_PER_M3 }}kg = {{ kg(volumeWeightKg) }}</b></li>
        <li><span>计费重量（实重/体积重取大）</span><b>{{ kg(preview.billableKg) }}</b></li>
        <li><span>本组本月已有累计</span><b>{{ tons(preview.priorTons) }}</b></li>
        <li><span>本批后累计</span><b>{{ tons(preview.afterTons) }}</b></li>
        <li v-if="afterTier.nextInTons !== null"><span>距下一档位还差</span><b>{{ tons(afterTier.nextInTons) }}</b></li>
      </ul>

      <div class="segments">
        <p v-if="preview.segments.length === 1" class="seg-row">
          <span class="seg-name">{{ preview.segments[0].label }}（不跨档）</span>
          <span class="seg-calc">{{ tons(preview.segments[0].tons) }} × {{ yuan(form.unitPricePerTon) }}/吨 × {{ preview.segments[0].discount }}</span>
          <b class="seg-amount">{{ yuan(preview.segments[0].amount) }}</b>
        </p>
        <template v-else>
          <p class="split-tip">本批跨档，拆成 {{ preview.segments.length }} 段分别计价：</p>
          <p v-for="(seg, i) in preview.segments" :key="i" class="seg-row">
            <span class="seg-name">{{ seg.label }}</span>
            <span class="seg-calc">{{ tons(seg.tons) }} × {{ yuan(form.unitPricePerTon) }} × {{ seg.discount }}<template v-if="form.service === '冷链'"> × 1.15</template></span>
            <b class="seg-amount">{{ yuan(seg.amount) }}</b>
          </p>
        </template>
        <p v-if="form.service === '冷链' && preview.segments.length === 1" class="cold-note">冷链在折后金额上加 15%</p>
      </div>

      <div class="preview-total">
        <span>试算应收（{{ form.service === "冷链" ? "含冷链+15%" : "标准运费" }}）</span>
        <strong>{{ yuan(preview.trialAmount) }}</strong>
      </div>

      <label class="settle-check">
        <input v-model="form.settled" type="checkbox" />
        本批已按其它价格结算（勾选后填写实收金额，差额留待确认）
      </label>
      <label v-if="form.settled" class="collected-row">
        实际已收金额 (元)
        <input v-model.number="form.collectedAmount" type="number" min="0" step="0.01" :placeholder="String(preview.trialAmount)" />
      </label>
      <p v-if="form.settled && wouldDiff !== 0" :class="['diff-warn', wouldDiff > 0 ? 'refund' : 'charge']">
        {{ wouldDiff > 0 ? `多收 ${yuan(wouldDiff)}，应退客户，登记为待确认差额` : `少收 ${yuan(-wouldDiff)}，应向客户补收，登记为待确认差额` }}
      </p>
      <p v-else-if="form.settled" class="diff-zero">实收与试算一致，不产生待确认差额。</p>
    </div>

    <p v-if="touched && !valid" class="form-error">请完整填写客户、线路、日期，且单价需大于 0。</p>
    <button type="submit" class="primary-btn">保存本批并试算</button>
  </form>
</template>
