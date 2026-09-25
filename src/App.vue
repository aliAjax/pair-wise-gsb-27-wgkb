<script setup lang="ts">
/** 页面层：装配表单、累计核对、待确认差额；业务逻辑均在 store / pricing / storage */
import { computed, ref } from "vue";
import BatchForm from "./components/BatchForm.vue";
import GroupList from "./components/GroupList.vue";
import PendingDiffs from "./components/PendingDiffs.vue";
import { useSettlementStore } from "./store/settlement";
import { tons, yuan } from "./utils/format";

const store = useSettlementStore();
const savedFlash = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function onSaved() {
  savedFlash.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (savedFlash.value = false), 1800);
}

const metrics = computed(() => {
  const totalTons = store.groups.reduce((s, g) => s + g.totalTons, 0);
  const settledBatches = store.batches.filter((b) => b.settled).length;
  const pendingNet = store.unconfirmedDiffs.reduce((s, d) => s + d.diffAmount, 0);
  return [
    { label: "累计分组（客户/线路/月）", value: String(store.groups.length) },
    { label: "本月累计计费吨位", value: tons(totalTons) },
    { label: "已结算批次", value: `${settledBatches} / ${store.batches.length}` },
    { label: "待确认差额", value: `${store.pendingDiffCount} 笔（${yuan(pendingNet)}）` }
  ];
});
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业 · 分批发货阶梯结算</p>
          <h1>分批结算台账</h1>
          <p class="subtitle">
            按客户和线路记本月累计计费重量：前 50 吨原价，50–100 吨降 3%，超过 100 吨降 6%；
            体积每立方米折 200 公斤，冷链加 15%。跨档批次自动拆两段计价，已结算批次不改价，差额留待确认。
          </p>
        </div>
        <div class="top-actions">
          <button type="button" class="secondary-btn" @click="store.resetAll()">恢复演示数据</button>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <transition name="flash">
        <p v-if="savedFlash" class="save-flash">本批已保存，累计吨位与各批金额已更新。</p>
      </transition>

      <section class="workspace">
        <BatchForm @saved="onSaved" />
        <div class="right-col">
          <GroupList />
          <PendingDiffs />
        </div>
      </section>

      <footer class="foot">
        <p>
          计价规则：计费重量 = max(实重, 体积m³ × 200kg)；段金额 = 段吨数 × 单价 × 档位折扣 ×（冷链 1.15）。
          数据保存在浏览器 localStorage，重开页面可继续核对。
        </p>
      </footer>
    </div>
  </main>
</template>
