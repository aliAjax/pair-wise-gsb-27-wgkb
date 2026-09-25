<script setup lang="ts">
// 页面-单条批次卡：展示计费重、跨档价格段、已结算/理论差额。
import { computed } from "vue";
import { BatchView } from "../store";
import { formatMoney, formatTon, signedMoney, tierLabel, discountText } from "../format";

const props = defineProps<{ view: BatchView }>();
const emit = defineEmits<{
  settle: [id: string];
  remove: [id: string];
}>();

const settled = computed(() => props.view.batch.status === "已结算");
const split = computed(() => props.view.segments.length > 1);
</script>

<template>
  <article class="batch" :class="{ settled, split }">
    <div class="batch-head">
      <div>
        <p class="batch-date">{{ view.batch.shipDate }}</p>
        <p class="batch-title">
          {{ view.batch.service }}
          <span v-if="view.batch.service === '冷链'" class="cold">冷链+15%</span>
        </p>
      </div>
      <span class="status" :class="settled ? 'is-settled' : 'is-transit'">
        {{ view.batch.status }}
      </span>
    </div>

    <div class="batch-grid">
      <span>实重 {{ formatTon(view.batch.weightKg) }}</span>
      <span>体积 {{ view.batch.volumeM3 }} m³</span>
      <span>计费重 {{ formatTon(view.chargeableKg) }}</span>
      <span>单价 ¥{{ view.batch.ratePerTon }}/吨</span>
      <span>批前累计 {{ formatTon(view.priorKg) }}</span>
      <span>批后累计 {{ formatTon(view.cumulativeKg) }}</span>
    </div>

    <ul class="segments">
      <li v-for="(segment, index) in view.segments" :key="index" :class="`tier-${segment.tier}`">
        <span class="seg-label">
          {{ tierLabel(segment.tier) }} · {{ formatTon(segment.weightKg) }}
          <em v-if="segment.effectiveRatePerTon !== view.batch.ratePerTon">
            （含冷链单价 ¥{{ segment.effectiveRatePerTon }}/吨）
          </em>
        </span>
        <span class="seg-discount">{{ discountText(segment.discount) }}</span>
        <strong>{{ formatMoney(segment.amount) }}</strong>
      </li>
    </ul>

    <div class="batch-foot">
      <p class="batch-amount">
        本批{{ settled ? '结算' : '试算' }}金额 <strong>{{ formatMoney(view.amount) }}</strong>
        <span v-if="split" class="split-flag">跨档已拆 {{ view.segments.length }} 段</span>
      </p>
      <p v-if="settled && view.difference !== 0" class="diff" :class="view.pending ? 'pending' : 'confirmed'">
        <template v-if="view.pending">
          现行阶梯理论 {{ formatMoney(view.currentAmount) }}，差额
          <strong>{{ signedMoney(view.difference) }}</strong>
          （{{ view.difference < 0 ? '应退客户' : '应补收' }}，待确认）
        </template>
        <template v-else>差额已确认 {{ signedMoney(view.difference) }}</template>
      </p>
      <p v-else-if="settled" class="diff confirmed">现行阶梯核对一致，无差额</p>

      <div class="actions">
        <button
          v-if="!settled"
          type="button"
          @click="emit('settle', view.batch.id)"
        >
          结算并冻结
        </button>
        <button class="danger" type="button" @click="emit('remove', view.batch.id)">
          删除
        </button>
      </div>
    </div>

    <p v-if="view.batch.notes" class="note">{{ view.batch.notes }}</p>
  </article>
</template>
