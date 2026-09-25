# 物流分批结算台账

- 行业：物流
- 技术栈：Vue3、Vite、TypeScript、Pinia、Element Plus
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

数据保存在浏览器 localStorage（key：`hxwl-settlement-v1`），重开页面后可继续核对累计吨位、各批金额与待确认差额。

## 结算规则

- 按**客户 + 线路**记本月累计重量（按发货日期归月、按发货日期+登记时间排序逐边累计）。
- 阶梯：前 50 吨原价，50–100 吨降 3%，超过 100 吨降 6%。
- 计费重量 = max(实重, 体积 × 200kg/m³)。
- 冷链在单价基础上加 15%。
- 跨档批次自动拆成多段金额（如批前累计 45 吨、本批 20 吨 → 5 吨原价 + 15 吨 97 折）。
- **已结算批次冻结不改价**；后续累计越档后，按现行阶梯理论重算的差额列为「待确认差额」，确认后只登记确认记录，批次金额保持不动。
- 批次先登记为「在途」（金额随累计实时重拆），再点「结算并冻结」。

## 代码分层（资料 / 阶梯计价 / 保存 / 页面）

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 资料 | `src/settlement/types.ts` | 批次、价格段、差额的数据结构与阶梯、冷链、体积折算等固定规则 |
| 阶梯计价 | `src/settlement/pricing.ts` | 纯函数：体积折重、冷链单价、按批前累计跨档拆段、理论差额重算 |
| 保存 | `src/settlement/storage.ts` | localStorage 读写、内置演示数据 |
| 保存（状态） | `src/settlement/store.ts` | Pinia：累计核对视图、登记/结算/删除/差额确认 |
| 页面 | `src/settlement/SettlementPage.vue`、`components/*.vue`、`format.ts` | 表单试算、分组台账、阶梯进度、差额确认记录 |
