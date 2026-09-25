<script setup lang="ts">
// 页面-分批结算主页：规则说明、指标、新增表单、分组核对、差额确认记录。
import { computed, ref } from "vue";
import { useSettlementStore } from "./store";
import BatchForm from "./components/BatchForm.vue";
import GroupPanel from "./components/GroupPanel.vue";
import { formatMoney, formatTon, signedMoney } from "./format";

const store = useSettlementStore();
const showLog = ref(false);

const metrics = computed(() => {
  const groups = store.groups;
  const batchCount = groups.reduce((sum, group) => sum + group.batches.length, 0);
  const settledCount = groups.reduce(
    (sum, group) => sum + group.batches.filter((item) => item.batch.status === "已结算").length,
    0
  );
  const totalKg = groups.reduce((sum, group) => sum + group.cumulativeKg, 0);
  const pending = groups.reduce((sum, group) => sum + group.pendingDifference, 0);
  return { batchCount, settledCount, totalKg, pending };
});

function resetDemo() {
  if (window.confirm("恢复为内置演示数据，当前登记将被覆盖，确定？")) store.resetAll();
}

function clearAll() {
  if (window.confirm("清空全部批次和确认记录，确定？")) store.clearAll();
}
</script>

<template>
  <main class="app settlement-app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流 · 客户分批发货阶梯结算</p>
          <h1>分批结算台账</h1>
          <p class="subtitle">
            按「客户 + 线路」记本月累计重量：前50吨原价，50–100吨降3%，超过100吨降6%；
            体积每m³折200kg，冷链单价加15%。跨档批次自动拆成两段金额；已结算批次不改价，差额留待确认。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>批次总数 / 已结算</span>
          <strong>{{ metrics.batchCount }} <em>/ {{ metrics.settledCount }}</em></strong>
        </article>
        <article class="metric">
          <span>全部客户线路累计</span>
          <strong>{{ formatTon(metrics.totalKg) }}</strong>
        </article>
        <article class="metric" :class="{ alert: metrics.pending !== 0 }">
          <span>待确认差额合计</span>
          <strong>{{ signedMoney(metrics.pending) }}</strong>
        </article>
      </section>

      <section class="rules">
        <span>① 计费重 = max(实重, 体积×200kg/m³)</span>
        <span>② 冷链单价 × 1.15</span>
        <span>③ 按客户+线路本月累计吨逐边拆档</span>
        <span>④ 已结算批次冻结，差额待确认</span>
      </section>

      <section class="workspace">
        <BatchForm />

        <section class="list-panel">
          <div class="toolbar">
            <h2>累计核对（客户 / 线路 / 本月）</h2>
            <div class="toolbar-actions">
              <button type="button" class="secondary" @click="showLog = !showLog">
                {{ showLog ? "隐藏确认记录" : `确认记录(${store.adjustments.length})` }}
              </button>
              <button type="button" class="secondary" @click="resetDemo">恢复演示</button>
              <button type="button" class="danger ghost" @click="clearAll">清空</button>
            </div>
          </div>

          <section v-if="showLog" class="log-panel">
            <h3>差额确认记录</h3>
            <div v-if="store.adjustments.length === 0" class="empty">暂无确认记录</div>
            <table v-else class="log-table">
              <thead>
                <tr>
                  <th>月份</th>
                  <th>客户</th>
                  <th>线路</th>
                  <th>差额</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="adj in store.adjustments" :key="adj.id">
                  <td>{{ adj.month }}</td>
                  <td>{{ adj.customer }}</td>
                  <td>{{ adj.route }}</td>
                  <td :class="adj.amount < 0 ? 'money-refund' : 'money-add'">
                    {{ signedMoney(adj.amount) }}
                  </td>
                  <td>{{ adj.note }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <div v-if="store.groups.length === 0" class="empty big">
            暂无批次，请在左侧登记第一批发货。
          </div>

          <div class="group-list">
            <GroupPanel v-for="group in store.groups" :key="group.key" :group="group" />
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
