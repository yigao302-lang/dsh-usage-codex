# dsh-usage-codex 用量统计页设计规格 v2（重做版）

> 本文是 t6「按设计规格重做用量统计页」的唯一实施依据。规格内所有数值、类名、文案、公式都是最终决定，
> 实施者**不需要再做任何设计决策**；凡本规格未写明的，一律保持现状不动。
>
> 适用范围：`lib/client.js`（客户端）+ `test/client-render.mjs`（断言更新）。
> **`lib/index.js`（宿主端）契约不得改动**：本规格全部基于现有 payload 字段，不新增 RPC、不新增字段。

---

## 0. 结论速览（给实施者与验证者）

| # | 事项 | 结论 |
| --- | --- | --- |
| D1 | 热力图月份标签错位 | 根因是**百分比定位**：标签容器 `.duc-u-heat-months` 宽 = 整张卡片内容区（≈724px），而格子区只占其中左侧 ≈180px；再叠加「星期栏宽度 + 5px 栏间距」与「3px 列间距」未计入。现状偏差从首列 −14px 一直放大到末列 ≈ −500px。见 §6.2 |
| D1 修法 | 像素定位 | 标签 `left = 21 + 13×col`（px，相对 `.duc-u-heat-wrap` 左内边缘），并且把星期栏改成**固定 16px 宽**；21 = 16（栏宽）+ 5（栏间距），13 = 10（格宽）+ 3（列间距）。见 §6.2.4、§9.5 |
| D2 | Codex 指标卡被压成小字 | 需要以**卡片**补回 3 项：**单会话峰值**、**最长聊天**、**连续天数**；第 4 项「累计 Token」与「总消耗」是同一个 `stats.totals.total`，**只保留一张卡**，不得出现两遍。见 §6.3、§8.1 |
| IA | 分区 | 保留「概览 / 趋势 / 明细」三个分区标签页，重排每个分区的模块归属（概览=KPI+热力图+当日明细；趋势=消耗趋势+模型用量+会话排行；明细=调用明细）。见 §7 |
| 数值 | 中文数量级 | `1e4 ≤ n < 1e8` → `X.X 万`；`n ≥ 1e8` → `X.XX 亿`（去尾零）；轴标签 `1e4` → `X 万`、`1e8` → `X.X 亿`。**不再使用 K/M/B**。见 §9.6 |

---

## 1. 调研方法与证据口径

- 三个参考项目均已完整下载到本机，本文所有引用都以 **源码 `文件:行号`** 为准，不采信 README 概述；
  README / 截图只用于交叉印证。
  - `/tmp/refs/AlfredChaos_dsh-usage-panel`（本文称 **参考 A**，视觉与功能组织的重点参考）
  - `/tmp/refs/Ychris12138_dsh-usage-stats`（本文称 **参考 B**）
  - `/tmp/refs/wannanbigpig_dsh-usage-stats`（本文称 **参考 C**）
  - 截图：`/tmp/refs/shots/screenshot-overview.png`、`screenshot-sessions.png`、`screenshot-hover-bar.png`
    （三张截图分别是参考 A 的 KPI 卡 + 热力图、会话排行、柱状图悬浮提示，取自 `AlfredChaos_dsh-usage-panel/assets/`）
- new-api 数据看板部分，引用 GitHub 主干源码（`Calcium-Ion/new-api`，`web/src/features/dashboard/**`），
  因为该项目已把旧版 `web/src/components/Dashboard` 重构为 `features/dashboard`（旧路径 404，见 §5）。
- DSH 设计令牌的可用性，除了三个参考项目外，还用**本机已安装并正在运行的插件**交叉验证
  （`~/.dsh/profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams/lib/client.js`、`skillhub-plugin/lib/client.js`），
  见 §9.1 的「本机实证」列。
- 现状代码引用以 `/Users/gaoyifei/Documents/deepseek-harness/dsh-usage-codex/lib/client.js` 为准。

---

## 2. 参考实现 A — AlfredChaos/dsh-usage-panel（重点参考）

### 2.1 信息架构

| 结论 | 证据 |
| --- | --- |
| 入口注册在 **设置页的一个 section**（`settings.section`，order 25），不是浮层、不是侧栏 | `src/client/index.tsx:32-42` |
| 页头 = 图标 + 标题 + 副标题（数据更新时间/状态机）+ 右侧动作（导出菜单 + 刷新按钮） | `src/client/StatsSection.tsx:128-156` |
| 单页纵向堆叠 **6 个模块，顺序固定**：KPI 卡组 → 活跃热力图 → 每日 Token 柱状图 → 会话用量排行 → 服务商用量 → 模型用量(环形) | `src/client/StatsSection.tsx:112-120` |
| 页面根容器：`flex-direction:column; gap:14px; padding:18px 20px 28px` | `src/client/styles.ts:7` |
| 状态机：loading / fresh / stale / fallback / error 五态，header 副标题承担状态文案 | `src/client/StatsSection.tsx:23,80-90` |

### 2.2 功能清单

| 模块 | 功能要点 | 证据 |
| --- | --- | --- |
| KPI 卡（4 张） | Token 总用量（含 输入/输出 明细）、总会话数量（含 总会话/有用量会话：主/子代理）、最常用模型（含 占比%）、缓存命中率（含 读/写） | `src/client/components/KpiCards.tsx:39-69`；文案 `src/client/locales.ts:14-22` |
| KPI 数值动画 | `useCountUp` easeOutCubic，900ms | `src/client/hooks.ts:57-74`；调用 `KpiCards.tsx:32-36` |
| 活跃热力图 | GitHub 贡献图式（列=周、行=周一→周日）、月份标签在顶部、少/多图例、悬浮显示「8月16日 · 375.8 万 Tokens」 | `src/client/components/Heatmap.tsx:88-106`；图例 `:80-86`；截图 `shots/screenshot-overview.png`、`shots/screenshot-hover-bar.png` |
| 热力图分档 | 非零日的**四分位**阈值 q1/q2/q3 → level 1..4（不是按最大值线性分档） | `src/shared/format.ts:56-67` |
| 每日柱状图 | 7/14/30 天切换、按模型堆叠、y 轴 nice 刻度、悬浮提示逐模型明细 | `src/client/components/BarChart.tsx:22,32-33,45-57,102-119,143-149,151-155` |
| 模型环形图 | Top5 + 「其他」合并、中心显示总量、右侧列表含 模型/用量/占比/命中率 | `src/client/components/ModelDonut.tsx:30-64,66-79,97-106`；`src/client/hooks.ts:20-54` |
| 会话排行 | 排名 + 标题 + 「主会话/子代理」标签 + 最近活跃日期 + Token | `src/client/components/SessionsCard.tsx:36-44`（截图 `shots/screenshot-sessions.png`） |
| 服务商用量 | 横向占比条 + Token；仅多于一个供应商时渲染 | `src/client/components/ProvidersCard.tsx:15-38` |
| 导出 | JSON / 每日 CSV / 模型 CSV，三种导出都以纯客户端方式从 overview 载荷生成 | `src/client/export.ts`、`src/client/components/ExportMenu.tsx` |
| i18n | zh/en 双词典，zh 触发 亿/万 格式 | `src/client/locales.ts:11-129`；`src/shared/format.ts:15-18` |
| 明确的 **不做** 清单 | 费用估算、预算/异常检测、常驻悬浮窗、账户余额 API —— 四项 no-go 及前提条件 | `docs/P2-decisions.md:1-40` |

### 2.3 视觉特征（配色 / 字号 / 卡片 / 数值格式 / 标签）

**卡片与容器**
- 卡片：`background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:14px 16px` —— `src/client/styles.ts:28`
- 卡片头：`flex; space-between; gap:10px; margin-bottom:12px; flex-wrap:wrap` —— `styles.ts:29`
- 卡片标题 `h3`：`13px / 600`，副标题 `11px / label-secondary` —— `styles.ts:30,33`
- KPI 网格：`grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px` —— `styles.ts:34`
- KPI 卡：`bg-layer-1 + border-l1 + radius 12px + padding 13px 15px` —— `styles.ts:35`
- 范围分段控件：`border-l1 + radius 8px`，按钮 `11px / padding 5px 11px`，选中 `bg-layer-2 + 600` —— `styles.ts:40-43`
- 空态：虚线边框卡片 `border:1px dashed var(--dsw-alias-border-l2); radius 12px` —— `styles.ts:67`
- 浮层提示：`fixed + radius 6px + 11px + border-l2 + shadow 0 2px 8px` —— `styles.ts:8-14`

**字号层级**
| 用途 | 规格 | 证据 |
| --- | --- | --- |
| 页面标题 h2 | 16px / 650 | `styles.ts:16` |
| 副标题 / 状态行 | 11px / label-secondary | `styles.ts:19` |
| 卡片标题 h3 | 13px / 600 | `styles.ts:30` |
| 卡片副标题 | 11px / label-secondary | `styles.ts:33` |
| KPI 标签 | 11px / label-secondary | `styles.ts:36` |
| KPI 数值 | **19px / 700** + `tabular-nums` | `styles.ts:37` |
| KPI 数值（文本型，如模型名） | 15px（`.v-sm`） | `styles.ts:38` |
| KPI 明细行 | 11px / label-secondary | `styles.ts:39` |
| 图表轴标签 | 10px / label-secondary | `styles.ts:45` |
| 列表/表格行 | 12px | `styles.ts:61,103` |
| 标签 tag | 10px / `radius 4px` / `padding 0 5px` / `line-height 16px` / `border-l2` | `styles.ts:108` |
| 图例项 | 11px，色块 9×9 `radius 3px` | `styles.ts:47-48` |

**热力图几何与配色**（本文 D1 的修法直接对标这里）
- 布局：`heat-wrap` 是 flex 容器，星期栏**绝对定位** `left:0; width:10px`，主区 `margin-left:18px` —— `styles.ts:69,71,73`
- **月份标签行与格子网格共用同一个 `gridTemplateColumns` 与同一个 `minWidth`**，所以标签天然与列对齐；每个标签（含空串）都占一个网格单元 —— `components/Heatmap.tsx:71,95,102`
- 网格：`display:grid; grid-auto-flow:column; grid-template-rows:repeat(7,auto); gap:3px` —— `styles.ts:76`
- 格子：`aspect-ratio:1/1; radius 2px`，hover 用 `box-shadow:0 0 0 1px border-l2` —— `styles.ts:77-78`
- 5 档配色（浅）：`#eef2f7 / #dbeafe / #93c5fd / #3b82f6 / #1d4ed8`；深色覆盖用 `body[data-ds-dark-theme]`：`#1f2937 / #1e3a8a / #2563eb / #3b82f6 / #60a5fa` —— `styles.ts:80-89`
- 图例：`少 [4 色块] 多`，11px，色块 10×10 `radius 2px` —— `styles.ts:90-91`；`Heatmap.tsx:80-86`

**数值格式（中文数量级）** —— `src/shared/format.ts`
```ts
// fmtTokens (format.ts:13-24)：完整数值（卡片、提示、表格）
if (v >= 1e8) return (v / 1e8).toFixed(2).replace(/\.?0+$/, '') + ' 亿'   // 注意：带空格
if (v >= 1e4) return (v / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万'    // 注意：带空格、去掉 .0
return String(v)

// fmtCompact (format.ts:27-38)：坐标轴刻度
if (v >= 1e8) return (v / 1e8).toFixed(1).replace(/\.0$/, '') + '亿'     // 无空格
if (v >= 1e4) return (v / 1e4).toFixed(0) + '万'                          // 无空格、取整
```
- 百分比：`((v/total)*100).toFixed(1)`（`format.ts:41-44`）；命中率卡片 `pctFull` 一位小数（`format.ts:97-99`）
- 日期标签：轴 `MM/DD`（`format.ts:70-73`），提示 `M月D日`（`format.ts:76-81`）
- y 轴 nice 上限：`1/2/5 × 10ⁿ`（`format.ts:47-53`）

---

## 3. 参考实现 B — Ychris12138/dsh-usage-stats

### 3.1 信息架构
- 形态：**固定 440px 宽的浮层面板**（`position:fixed; bottom:128px; left:12px; max-height:74vh; radius 12px`），
  不是设置页 section —— `lib/client.js:89`
- 面板头：标题 13px/500 + 关闭/导出等图标按钮 —— `lib/client.js:92-97`
- 用量区分区顺序（同一滚动列）：
  1. 账户卡（`account.title`）—— `lib/client.js:1145`
  2. 用量统计区（`usage.title`）：三格统计（今日 / 本月 / 累计）+ 今日命中率说明行 —— `lib/client.js:1178,1195-1211`
  3. 热力图区（`usage.heatmap`）：月份导航（‹ 月份标题 › + 今天）+ 月历热图 + 图例 —— `lib/client.js:1221-1264`
  4. 最近 N 天列表（`usage.recent`）：日期 / Token / 命中率 / 占比条，**整行可点击**下钻 —— `lib/client.js:1265-1290`
  5. 会话费用（`sessionCost.title`）—— `lib/client.js:1291-1310`
  6. 导出（`export.title`）—— `lib/client.js:1311-1319`
- 分区标题统一样式：`.usg_sectionTitle{11px; color:label-tertiary; margin:0 0 6px}`；分区之间 `.usg_section{margin-top:12px}` —— `lib/client.js:99-100`

### 3.2 功能清单
| 能力 | 证据 |
| --- | --- |
| 今日/本月/累计 三格统计卡（值 15px/600，标签 11px tertiary） | `lib/client.js:1195-1200`（结构）、`:156-159`（CSS） |
| 今日缓存命中率说明行 | `lib/client.js:1203-1211`、`:160-161` |
| 月历热图（**7 列 = 周一到周日表头 + 每周一行**，格子内显示日号、可点选） | `lib/client.js:1732-1786` |
| 月份切换（‹ ›，未来月禁用，可回到「今天」） | `lib/client.js:1228-1254`、CSS `:165-171` |
| 日详情下钻（返回按钮 + 日期 + 命中率 + 汇总行 + 按模型占比条） | `lib/client.js:1673-1725` |
| 热力图图例「少 [5 色块] 多」 | `lib/client.js:1773-1783`、CSS `:184-185` |
| 导出 daily/sessions CSV（服务端链接） | `lib/client.js:1318-1319` |

### 3.3 视觉特征
- 分类前缀 `usg_`，全部颜色走 DSH 令牌（`--dsw-alias-label-primary/-secondary/-tertiary/-caption`、`--dsw-alias-fill-l1/l2`、`--dsw-alias-border-l1/l2/l3`、`--dsw-alias-interactive-bg-hover`、`--dsw-alias-state-success/error-primary`）—— `lib/client.js:69-200`
- 余额大数：`24px / 600 / line-height 32px / tabular-nums` —— `lib/client.js:106`
- 统计卡：`border-l2 + radius 10px + padding 8px 10px`，值 15px/600，标签 11px tertiary —— `lib/client.js:157-159`
- **热力图对齐关键证据**：周几表头行与每个周行**用同一个网格模板** `grid-template-columns:repeat(7,1fr)`，
  表头是网格里的真实单元而不是绝对定位 —— `lib/client.js:173,175`；格子 `aspect-ratio:1/1; radius 8px`，日号 12px/700 —— `lib/client.js:176,182`
- 热力色：`rgba(31,111,235,alpha)`，`alpha = min(1, 0.22 + 0.78*√(tokens/max))`（连续档而非离散档）—— `lib/client.js:677-691`
- **数值格式走国际单位**：`fmt(1234) → "1,234"`（千分位）、`fmtCompact(1234) → "1.2k"`、`(1234567) → "1.2m"` —— `lib/client.js:363-373`
  （这是与本项目目标口径的**反面参照**：本规格要求中文 万/亿，见 §9.6）

---

## 4. 参考实现 C — wannanbigpig/dsh-usage-stats

### 4.1 信息架构
- 形态：**920px 宽的浮层面板**（`max-height:94vh; radius 24px`）—— `lib/client.js:42`
- **分区标签页 3 个：全部 / 概览 / 明细** —— 词典 `lib/client.js:5653-5656`
- 区块清单（词典即模块清单）：工作区 Token 分布（`workspace.title`，`:5657`）、模型用量（`usage.modelUsage`，`:5722`）、
  多模型趋势（`usage.modelTrend` + TOP5 按小时/按天，`:5723-5725`）、全局用量时序（`usage.globalTimeline`，`:5757`）、
  年度每日用量热图（`usage.heatmap`，`:5758`）、最近 14 天（`usage.recent`，`:5762`）、近期用量明细（`usage.detailsTitle`，`:5763`）
- 时间维度枚举：今天 / 昨天 / 近 7 天 / 近 30 天 / 本月 / 上月 —— `lib/client.js:5736-5742`

### 4.2 功能清单
| 能力 | 证据 |
| --- | --- |
| 年度贡献热图（53 周滚动，年份下拉切换） | `lib/client.js:1759-1807`、CSS `:260-277` |
| 悬浮提示（Portal 到 body，跟随指针，含 日期+金额 / 总量 / 输入 / 模型明细） | `lib/client.js:1809-1819` |
| 按小时趋势（峰值区间高亮 + 悬浮模型拆分） | CSS `:202-215` |
| 天卡列表（日期 / Token / 费用胶囊 / 占比条，点击下钻） | CSS `:230-238` |
| 模型排行行（模型名 + 供应商标 + Token + 请求数 + 占比条） | `lib/client.js:2524-2563` |
| 明细页 Hero 头（大数值 24px/600 + 胶囊标签） | CSS `:225-229` |

### 4.3 视觉特征（**对齐实现的最佳范本**）
- **贡献热图用单个 CSS Grid 承载「月份标签行 + 星期栏 + 格子」三者**：
  ```css
  /* lib/client.js:263 */
  .usg_contribGrid{grid-template-rows:16px repeat(7,10px); gap:3px; min-width:max-content; width:100%; justify-content:center; display:grid}
  /* lib/client.js:264-265 */
  .usg_contribMonth{color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:14px; white-space:nowrap; align-self:end}
  .usg_contribWeekday{color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:10px; white-space:nowrap; align-self:center}
  /* lib/client.js:270-277 */
  .usg_heatCell{width:10px;height:10px;border-radius:2px;background:var(--usg-cellEmpty);...}
  .usg_heatLegend{...font-size:10px;color:var(--dsw-alias-label-tertiary)}
  ```
  并且**所有元件用显式 `gridColumn/gridRow` 落位**（`lib/client.js:1773-1806`）：
  ```js
  style: { gridTemplateColumns: `28px repeat(${heat.weeks.length},10px)` }      // :1773
  heat.months.map(item => <span style={{gridColumn: item.weekIndex + 2, gridRow: 1}} />)        // :1775-1779
  weekdayLabels.map(item => <span style={{gridColumn: 1, gridRow: item.dayIndex + 2}} />)        // :1780-1784
  cells.map((cell, dayIndex) => <button style={{gridColumn: weekIndex + 2, gridRow: dayIndex + 2}} />)  // :1785-1806
  ```
  → 标签和格子在**同一个坐标系**里，不存在「百分比估算」这一类错位来源。这是 D1 的权威依据。
- 令牌化主题变量组（含回退链）：`--usg-blue:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-500,#4176e6))`、
  `--usg-cellEmpty:var(--dsw-alias-interactive-bg-hover)` —— `lib/client.js:42,56`
- 热力色用 `color-mix` + √ 比例连续生成，随主题自动适配：`color-mix(in srgb,var(--usg-blue) ${intensity}%,var(--usg-cellEmpty))` —— `lib/client.js:868-874`
- 字号/圆角：Hero 大数 24px/600，天卡日期 12px/500、Token 13px/600，行半径 13px，卡片半径 20px，胶囊 `radius:999px` —— `lib/client.js:225-238`
- 响应式断点：`@media(max-width:560px)` 收窄面板与内边距 —— `lib/client.js:450`
- **数值格式同样走国际单位**（`formatNumber` / `formatCompactNumber`，`web` 端本地化）—— `lib/client.js:48-56`

---

## 5. new-api 数据看板的组织方式（KPI 卡片 · 趋势 · 分布 · 榜单）

佐证来源：GitHub 主干 `Calcium-Ion/new-api`，`web/src/features/dashboard/**`
（旧版 `web/src/components/Dashboard` 已不存在：GitHub contents API 返回 `Not Found`）。

| 看板要素 | new-api 的做法 | 证据（主干源码） |
| --- | --- | --- |
| 页面骨架 | Dashboard 页拆成 4 个 **section 标签页**：`overview` / `models`(Model Call Analytics) / `flow` / `users`(User Analytics，adminOnly) | `web/src/features/dashboard/section-registry.tsx:25-47` |
| **KPI 卡片** | 概览顶部 `SummaryCards`：标题「Usage at a glance」+ 副标题 + **3 列 StatCard 网格**；卡片 = `title / value / description / icon(tone) / sparkline(bars|line) / details[]`；右侧独立竖栏放「Credit remaining + 健康点 + Last 24h usage + Runway + Wallet 按钮」 | `components/overview/summary-cards.tsx:232-282,291-350`；卡片契约 `components/ui/stat-card.tsx:26-49` |
| KPI 数值格式 | 大数走 `formatCompactNumber`（`1.2K/3.4M`），完整值挂在 `title` 上；另有 `log-stat-cards` 复用同一格式化 | `components/models/log-stat-cards.tsx:48-56,136-137` |
| **趋势** | `FlowCharts`：时间粒度 hour/day/week（`TIME_GRANULARITY_OPTIONS`）、时间范围 1/7/14/29 天（`TIME_RANGE_PRESETS`）、可切换宽度指标 Quota/Tokens/Requests/Share | `constants.ts:26-37,40-51`；`components/flow/flow-charts.tsx:456-463` |
| **分布** | 两个入口：`ConsumptionDistributionChart`（bar/area 切换，按时间粒度聚合）；`ModelCharts` 的三选一标签页 **Call Trend / Call Count Distribution / Call Count Ranking** → 分别对应 `spec_model_line` / `spec_pie` / `spec_rank_bar` | `components/models/consumption-distribution-chart.tsx:51-57,69-71`；`components/models/model-charts.tsx:44-49`；`constants.ts:53-62` |
| **榜单** | `user-charts.tsx` 的「User Consumption Ranking」，标题 `Top Users` + `Top {{count}}` 数量选择器（limit 可调） | `components/users/user-charts.tsx:58,202-216` |
| 一致性手法 | 卡片入场动画包裹（`StaggerContainer` / `CardStaggerItem`）、`IconBadge tone='chart-N'` 让同类卡片共享色相、`bg-card rounded-2xl border shadow-xs` 作为卡片统一外观 | `summary-cards.tsx:269-283`；`model-charts.tsx:122-146` |

**对本项目的可迁移结论**：① KPI 卡片 = 标题 + 主数值 + 说明行（+ 可选迷你趋势）；② 趋势/分布/榜单三者各自有**切换器**
（粒度或图形类型），而不是三个并排的静态图；③ 榜单用「Top N + 数量选择」表达。

---

## 6. 现状诊断（dsh-usage-codex）

### 6.1 现状信息架构
- 形态：输入框工具行右侧图标 → 全屏遮罩浮层，卡片 `width:min(780px,100%)`，圆角 14px —— `lib/client.js:47-56,260-271`
- 分区标签页 3 个：概览 / 趋势 / 明细 —— `lib/client.js:754,781-811`
- 概览 = 指标条 + 热力图 + 当日明细（选中时） —— `lib/client.js:781-797`
- 趋势 = 消耗趋势 + 模型消耗明细 —— `lib/client.js:798-800`
- 明细 = 调用明细（最近 50 条 / 某日明细 + 模型筛选） —— `lib/client.js:801-810`

### 6.2 缺陷 D1：热力图「月份标签与小格子错位」

#### 6.2.1 现状实现（精确行号）

```
lib/client.js:89   .duc-u-heat-wrap{position:relative;padding-top:16px;}
lib/client.js:90   .duc-u-heat-months{position:absolute;top:0;left:0;right:0;height:14px;}
lib/client.js:91   .duc-u-heat-month{position:absolute;top:0;font-size:10px;...}
lib/client.js:92   .duc-u-heat-body{display:flex;gap:5px;}
lib/client.js:93   .duc-u-heat-weekdays{display:flex;flex-direction:column;gap:3px;font-size:9px;...}   ← 宽度 auto，无固定值
lib/client.js:95   .duc-u-heat-cols{display:flex;gap:3px;}
lib/client.js:96   .duc-u-heat-col{display:flex;flex-direction:column;gap:3px;}
lib/client.js:97   .duc-u-heat-cell{width:10px;height:10px;border-radius:3px;...}
lib/client.js:406-415  月份标签生成循环
lib/client.js:412        style: { left: ((col / columns) * 100) + '%' }        ← 缺陷所在
lib/client.js:417-422  wrap > months + body(weekdays + cols) 结构
```

#### 6.2.2 根因：三个错误叠加，主因是**百分比的分母取错了**

**错误 ①（主因）** `.duc-u-heat-months` 是 `position:absolute; left:0; right:0`，它的宽度 = **`.duc-u-heat-wrap` 的宽度**，
而 `.duc-u-heat-wrap` 是 `.duc-u-card`（块级）里的普通 `div`，宽度 = **整张卡片的内容宽 ≈ 724px**
（浮层 780px − 边框 2 − body padding 28 − 卡片边框 2 − 卡片 padding 24）。
但格子区 `.duc-u-heat-cols` 只是 flex 行里靠左的一段，13–14 列时只有 `13×13−3 = 166px` ～ `14×13−3 = 179px` 宽
（不含左侧 16px 星期栏与 5px 栏间距）。
于是 `left:(col/columns)*100%` 把标签铺满了**整张卡片**，而格子在左侧一小段里 —— 列号越大偏得越远。

**错误 ②** 即使把标签容器收窄到格子区宽度，百分比仍然错：盒子从 `x=0` 起算，而第 0 列从
`星期栏宽度 + body 的 5px 间距` 起算；星期栏宽度是 auto（9px 字号下的 `一/三/五` ≈ **9px**，且随字体浮动）。

**错误 ③** 百分比按「等分整段宽度」分配，而列实际是 `10px 格 + 3px 间距` 的**等差推进**，两者只在 `col=0`
（或容器宽恰等于格距×列数）时重合；列间距 3px 从未被计入。

#### 6.2.3 偏差量化（可直接复算）

设：`W` = 标签容器宽（px），`g` = 星期栏宽，`bodyGap=5`，`cell=10`，`gap=3`，`columns` = 列数。

```
现状标签 x  = (col / columns) × W
正确标签 x  = g + bodyGap + col × (cell + gap) = g + 5 + 13·col
偏移        = 现状 x − 正确 x        （负数 = 标签比该列偏左，正数 = 偏右）
```

现状（`W = 724`，13 列，`g = 9`）：

| 列 col | 现状标签 x | 正确 x | 偏移 | 折算 |
| --- | --- | --- | --- | --- |
| 0 | 0.0px | 14.0px | −14.0px（偏左） | 1.1 格 |
| 1 | 55.7px | 27.0px | +28.7px（偏右） | 2.2 格 |
| 4 | 222.8px | 66.0px | +156.8px | 12.1 格 |
| 6 | 334.2px | 92.0px | +242.2px | 18.6 格 |
| 9 | 501.2px | 131.0px | +370.2px | 28.5 格 |
| 12 | 668.3px | 170.0px | +498.3px | 38.3 格 |

（14 列 同形：col 0 → −14.0px，col 13 → +489.3px。）

即使只修「容器宽度」这一项（把 `W` 收窄成格子总宽 `columns×13−3`），仍会留下 **−14.0 → −16.8px** 的固定偏移
（= 星期栏宽度 + 5px 间距，再叠加列间距分配误差）——**这正好说明为什么必须改成像素定位**。

复算脚本（验证者可自行运行核对，输出依次为 现状 x、正确 x）：
```bash
node -e '
const cell=10,gap=3,bodyGap=5,g=9,W=724;
for (const columns of [13,14]) for (const c of [0,1,4,6,9,12,13].filter(x=>x<columns))
  console.log(columns, c, ((c/columns)*W).toFixed(1), (g+bodyGap+c*(cell+gap)).toFixed(1));
'
```

#### 6.2.4 修法（唯一实现方案；任何等价改写都必须保持 §6.2.4 末的不变式，否则视为偏离）

**必须实现的三件事：**

1. **星期栏固定宽度**：把 `lib/client.js:93` 改为
   ```css
   .duc-u-heat-weekdays{width:var(--duc-heat-gutter,16px);flex:none;text-align:right;display:flex;flex-direction:column;gap:var(--duc-heat-gap,3px);font-size:10px;line-height:1;color:var(--dsw-alias-label-secondary);}
   ```
   行高仍与格子行一致：`.duc-u-heat-weekdays span{height:var(--duc-heat-cell,10px);line-height:var(--duc-heat-cell,10px);}`
   （星期栏与 `.duc-u-heat-col` 同为「10px 子项 + 3px gap」的竖向 flex，因此 `一/三/五` 天然落在第 0/2/4 行。）

2. **标签改成像素定位**：`lib/client.js:412` 改为
   ```js
   style: { left: heatLabelLeft(col) + 'px' }   // heatLabelLeft(col) = 16 + 5 + col*(10+3) = 21 + 13·col
   ```
   并在组件外定义单一来源常量（CSS 里的 4 个几何值必须与之一致）：
   ```js
   /** 热力图几何常量：与 CSS 的 --duc-heat-cell/-gap/-gutter/-bodygap 必须逐值一致。 */
   const HEAT = { cell: 10, gap: 3, gutter: 16, bodyGap: 5 }
   /** 月份标签相对 .duc-u-heat-wrap 左内边缘的绝对左边缘（px）。 */
   function heatLabelLeft(col) { return HEAT.gutter + HEAT.bodyGap + col * (HEAT.cell + HEAT.gap) }
   ```

3. **两个容器用同一套几何**：`.duc-u-heat-body{gap:var(--duc-heat-bodygap,5px)}`、
   `.duc-u-heat-cols{gap:var(--duc-heat-gap,3px)}`、`.duc-u-heat-cell{width:var(--duc-heat-cell,10px);height:var(--duc-heat-cell,10px)}`、
   `.duc-u-heat-pad` 同步。`.duc-u-heat-months` 保持 `left:0;right:0`（标签自己带绝对 px，与容器宽度无关）。

**不变的语义**（不得顺手改掉）：月份标签的取月规则仍是
`idx = min(max(0, col*7 - lead), days.length-1)`（`lib/client.js:409`），即「该列第一格所在月份」变月才出标签；
首列恒定出标签（`col=0` 时 `idx=0`）。窗口构造 `buildDailyWindow`（`lib/client.js:223-249`）与 90 天窗口常量
（`lib/client.js:217`）**一行都不改**。

**验收用的不变式**（验证者按此独立复算，不要读实现常量）：
```
label(col).left === (16 + 5 + 13×col) + 'px'，且 16 = 星期栏固定宽，5 = 星期栏与格子区间距，13 = 10 + 3
label(0).left === '21px'；columns=13 时最后一列 col=12 → '177px'；columns=14 时 col=13 → '190px'
```

### 6.3 缺陷 D2：「Codex 指标」被压成小字，需要以卡片形式补回

**项目自身对「Codex 指标」的定义**（改版前的原始注释，`git show c622879^:lib/client.js`）：
> `/** Codex 用量页的四张指标卡：累计 Token / 单会话峰值 / 最长聊天时长 / 连续天数。数据来自宿主 perSession 聚合；连续天数按日历相邻判定，跨夏令时安全。 */`

**必须补回为卡片的指标（3 项）+ 1 项去重：**

| 指标 | 数据来源 | 卡片内容 | 为什么 |
| --- | --- | --- | --- |
| **单会话峰值** | `stats.sessionPeak = { tokens, title, date }`（`lib/index.js:345,367`） | 主数值 `fmtTokens(tokens)` + 单位 `tokens`；说明行 = 会话标题（无则「未命名会话」）+ ` · ` + `date` | 改版后仅作为 `.duc-u-chip` 小字出现（`lib/client.js:341`） |
| **最长聊天** | `stats.longestChat = { durationMs, title, id }`（`lib/index.js:346,368`） | 主数值 `fmtDur(durationMs)`（文本型，15px）；说明行 = 会话标题 | 同上（`lib/client.js:342`） |
| **连续天数** | `stats.streaks = { current, longest }`（`lib/index.js:369`） | 主数值 `current` + 单位 `天`；说明行 `最长 N 天` | 已存在卡片，**保持**它仍是卡片 |
| **累计 Token** | `stats.totals.total` | —— **不新增卡片** | 与「总消耗」是同一个字段（`lib/index.js:352`），改版前的处理见 `git show c622879^:lib/client.js`：两张瓦片取同一个 `totals.total`。全页不得出现两个都叫「累计 Token / 总消耗」的数值瓦片 |

补回后概览分区共 **6 张 KPI 卡**：总消耗、请求数、缓存命中率、连续天数、单会话峰值、最长聊天（详见 §8.1）。
其余「轮次/步数/工具」「耗时」「性能」三项**不进卡片**，继续放在次要指标条（`.duc-u-sub`）里（`lib/client.js:340-346`）。

---

## 7. 目标信息架构

**保留「概览 / 趋势 / 明细」三分区标签页**（`lib/client.js:753-761` 的范围切换与刷新保持全局生效），
但重排每个分区的模块归属，并补齐参考 A 的信息层级（页头状态行、卡片头「标题 + 副标题 + 右侧图例/切换器」）。

| 分区 | 模块（自上而下） | 与现状的差异与理由 |
| --- | --- | --- |
| **概览** | A1 指标区（6 张 KPI 卡 + 次要指标条）<br>A2 活跃热力图卡（三视图 + 图例 + 摘要）<br>A3 当日明细卡（选中某天时） | 差异：KPI 由「4 卡 + 一行小字」改为「6 卡 + 一行小字」；热力图卡片头新增「少/多」图例（参考 A `Heatmap.tsx:80-86`）。理由：用户明确要求 Codex 指标以卡片回归（见 §6.3），图例是参考 A 视觉语言的组成部分 |
| **趋势** | B1 消耗趋势卡（堆叠柱）<br>B2 模型用量卡（环形 + 明细表，含命中率列）<br>B3 会话用量排行卡（新增） | 差异：新增 B3；B2 增「命中率」列。理由：参考 A 的模块顺序中，柱状图之后就是会话排行（`StatsSection.tsx:112-120`），宿主已返回 `stats.sessions` Top20（`lib/index.js:366`），零成本补齐「榜单」这一看板要素（§5） |
| **明细** | C1 调用明细卡（最近 50 条 / 某日全部 + 模型筛选 + 日期清除） | 差异：无功能变化，仅视觉规范落地 |

跨分区保持不变的交互：范围切换（1天/7天/30天/至今）与刷新对所有分区生效；热力图点选日期跨分区保留；
「查看该日调用 →」从概览跳明细；再次点击或「✕ 清除」取消选择。

---

## 8. 分区模块清单（逐组件规格）

> 组件名沿用现有函数名（`MetricStrip` / `UsageHeatmap` / `DayDetail` / `UsageBars` / `UsageModels` / `UsageRecords`），
> 新增 `UsageSessions`。Markup 中的类名若未特别说明，均沿用现有类名（测试按类名查找）。

### 8.1 A1 指标区 `MetricStrip`

结构（`lib/client.js:290-351` 重写）：

```
<div class="duc-u-metrics">                        // flex column; gap:10px
  <div class="duc-u-tiles">                        // grid: repeat(auto-fit,minmax(190px,1fr)); gap:10px
      ...6 张 <div class="duc-u-tile">
                <div class="duc-u-tile-label">标签 + 环比 delta</div>
                <div class="duc-u-tile-value">主数值 <small>单位</small></div>   // 或环形图
                <div class="duc-u-tile-sub">说明行</div>
             </div>
  </div>
  <div class="duc-u-sub">                          // 次要指标条（保留现状）
      <span class="duc-u-chip"><i>轮次/步数</i>N 轮 · M 步 · 工具 K 次</span>
      <span class="duc-u-chip"><i>耗时</i>LLM 1h2m · 工具 3m</span>
      <span class="duc-u-chip"><i>性能</i>首 token 2.3s · 88 tok/s</span>
  </div>
</div>
```

6 张卡（**DOM 顺序固定**）：

| # | 标签 | 主数值 | 单位 | 说明行 | 环比 delta |
| --- | --- | --- | --- | --- | --- |
| 1 | `总消耗` | `fmtTokens(totals.total)` | `tokens` | `输入 {fmtTokens(totals.prompt)} · 输出 {fmtTokens(totals.completion)}` | `totals.total` vs `prevTotals.total` |
| 2 | `请求数` | `Number(totals.requests).toLocaleString()` | 无 | `全部模型调用` +（`range!=='1d'` 时）` · 日均 {avg} 次` | `totals.requests` vs `prevTotals.requests` |
| 3 | `缓存命中率` | 环形（56px conic-gradient，中心 `{Math.round(hit)}%`） | 无 | 两行：`命中 {fmtTokens(cache_read)}` / `新输入 {fmtTokens(prompt-cache_read)}` | 无 |
| 4 | `连续天数` | `streaks.current` | `天` | `最长 {streaks.longest} 天` | 无 |
| 5 | `单会话峰值` | `peak ? fmtTokens(peak.tokens) : '—'` | `tokens` | `peak ? (peak.title \|\| '未命名会话') + (peak.date ? ' · ' + peak.date : '') : '暂无会话数据'` | 无 |
| 6 | `最长聊天` | `longest ? fmtDur(longest.durationMs) : '—'`（**文本型 15px**） | 无 | `longest ? (longest.title \|\| '未命名会话') : '暂无会话数据'` | 无 |

规则：
- 环比 delta 文案与现状一致：`▲ 12%` / `▼ 8%`，`title="对比上一周期"`（`lib/client.js:297-302`），无上一周期时不渲染。
- 命中率公式沿用现状：`hit = prompt > 0 ? cache_read / prompt * 100 : null`（`lib/client.js:303`），`null` 时中心显示 `—`。
- 说明行超长一律单行省略：`.duc-u-tile-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`，容器加 `min-width:0`。
- **不得出现**「累计 Token」字样的第二张卡（见 §6.3）。

### 8.2 A2 活跃热力图卡 `UsageHeatmap`

- 卡片头：左 `h3.用量日历`；右 `.duc-u-seg` 三视图（每日/每周/累计）；**新增** `.duc-u-heat-legend`：
  `少 [■ ■ ■ ■] 多`（4 个色块对应 level 1–4，10×10、`radius:2px`，图例文字 11px）——参考 A `Heatmap.tsx:80-86`、`styles.ts:90-91`。
- 每日视图 DOM（关键部分，`lib/client.js:406-422` 按此调整）：
  ```
  <div class="duc-u-heat-wrap">                     // position:relative; padding-top:16px
    <div class="duc-u-heat-months">
        <span class="duc-u-heat-month" data-col="{col}" style="left:{21+13*col}px">M月</span> ...   // 仅变月处出标签
    </div>
    <div class="duc-u-heat-body">                   // display:flex; gap:5px
        <div class="duc-u-heat-weekdays">           // width:16px; flex:none; text-align:right
            <span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span></span>
        </div>
        <div class="duc-u-heat-cols">               // display:flex; gap:3px
            <div class="duc-u-heat-col">            // display:flex; column; gap:3px
                <i class="duc-u-heat-cell" data-l="0..4" /> ×7   // 窗口外为 <i class="duc-u-heat-pad" />
            </div> × columns
        </div>
    </div>
    <div class="duc-u-tip" />                       // position:fixed（见 §9.7）
  </div>
  ```
- 每个月份标签必须有 `data-col`（列号）与 `style.left`（px 字符串），供验证者逐列比对。
- 三视图共用 `buildDailyWindow(daily, 90)`；每列 7 行、行序周一→周日、今天在窗口最后一格、
  窗口外补 `.duc-u-heat-pad`，全部**保持现状语义**（`lib/client.js:366-427`）。
- 卡片底部摘要保持：`共 {requests.toLocaleString()} 次调用 · {fmtTokens(tokens)} tokens` + 右侧提示
  （未选中：`点击某天查看当日明细`；已选中：`已选 {date}`）。
- 悬浮提示内容保持现状三行（`{fmtTokens} tokens` / `{requests} 次请求` / `轮 X · 步 Y · 工具 Z`），
  仅定位方式改为 `position:fixed` + `getBoundingClientRect()`（见 §9.7 第 8 条）。

### 8.3 A3 当日明细卡 `DayDetail`
保持现状（`lib/client.js:521-558`）：标题 `{date} 当日明细`、动作 `查看该日调用 →` / `✕ 清除`、
汇总行 `请求 N · 轮 N · 步 N · 工具 N · 缓存读 X`、逐模型行（模型名 / tokens / 次）；无记录时
`该日没有模型调用记录`。仅视觉规范（字号/间距/数值格式）落地。

### 8.4 B1 消耗趋势卡 `UsageBars`
保持现状（`lib/client.js:560-631`）：按范围切片，`all` 折叠为周；
三段堆叠顺序固定 `新输入(--duc-c1)` → `输出(--duc-c2)` → `缓存命中(--duc-c3)`；
y 轴 4 条虚线 + 刻度，x 轴标签稀疏规则不变。**唯一变化**：刻度文本改用 `fmtCompact`（万/亿），
颜色改为 §9.1 的新调色板，图例色块 9×9（`radius:2px`，11px）。柱子的原生 `title` 提示**本期不改**（见 §10 第 14 条）。

### 8.5 B2 模型用量卡 `UsageModels`
保持现状（`lib/client.js:633-682`）的「环形 + 明细表」结构，两处变更：
1. 颜色改用模型色板 `--duc-m1..--duc-m10`（同一模型在环形、表格色块、图例中同色；"其他" 不适用，因为表格列出全部模型）。
2. 表格在「请求」与「输入」之间**新增「命中率」列**：`cacheRead / input * 100`，`toFixed(1) + '%'`，
   `input === 0` 时显示 `—`（宿主 `models[].input` 已含缓存读，见 `lib/index.js:302`）。
   表头顺序：`模型 / 占比 / 请求 / 命中率 / 输入 / 输出 / 缓存命中`，数值列右对齐。

### 8.6 B3 会话用量排行卡 `UsageSessions`（新增）
- 渲染条件：`Array.isArray(stats.sessions) && stats.sessions.length > 0`，否则**整卡不渲染**（参考 A `SessionsCard.tsx:18`）。
- 卡片头：`h3.会话用量排行` + 副标题 `按全部历史 Token`（参考 A `SessionsCard.tsx:22-26`、`locales.ts:38-39`）。
- 取前 10 条（`stats.sessions` 已是按 tokens 降序，`lib/index.js:344,366`）。
- 每行结构（`.duc-u-rank-row`）：
  ```
  <span class="duc-u-rank-no">1</span>                      // 11px; label-secondary; width:20px; 右对齐
  <span class="duc-u-rank-name" title="{id}">{title || '未命名会话'}</span>   // 12px; flex:1; 单行省略
  <span class="duc-u-rank-date">{YYYY-MM-DD}</span>          // 11px; label-secondary; 由 endedAt 得到
  <span class="duc-u-rank-tokens">{fmtTokens(tokens)}</span> // 12px; tabular-nums
  ```
- 日期取 `dayKeyOf(new Date(session.endedAt))`（宿主 `endedAt` 可能为 null → 显示 `—`）。
- **不渲染**「主会话/子代理」标签：宿主未采集会话深度，`lib/index.js:69-80` 的 `perSession` 只有
  `tokens/requests/first/last/title`，不得臆造。

### 8.7 C1 调用明细卡 `UsageRecords`
保持现状（`lib/client.js:684-738`）的全部行为：最近 50 条 / 选中日期时该日全部明细、模型筛选下拉、
`✕ 取消日期筛选`、空态文案分支、时间列用 `toLocaleDateString() + ' ' + toLocaleTimeString()`。
仅视觉规范落地（表格 12px、数值列右对齐 + 等宽数字、表头 11px）。

---

## 9. 视觉规范

### 9.1 颜色令牌

**必须复用 DSH 设计令牌**，只在本项目私有变量里做一次映射（下表「本机实证」= 该令牌出现在
本机 `~/.dsh/profiles/desktop/node_modules` 下正在运行的插件源码中）。

| 用途 | 令牌（含回退） | 依据 |
| --- | --- | --- |
| 卡片/瓦片底色 | `var(--dsw-alias-bg-layer-1)` | 参考 A `styles.ts:28,35`；现状 `lib/client.js:79,120` |
| 次级底色（选中态/进度槽） | `var(--dsw-alias-bg-layer-2)` | 参考 A `styles.ts:27,43` |
| 边框（卡片/分隔线） | `var(--dsw-alias-border-l1)` | 参考 A `styles.ts:28,29`；现状 `lib/client.js:79` |
| 边框（强调/hover/标签） | `var(--dsw-alias-border-l2)` | 参考 A `styles.ts:8,22,78,108` |
| 主文本 | `var(--dsw-alias-label-primary)` | 参考 A `styles.ts:16,30,37` |
| 次文本 | `var(--dsw-alias-label-secondary)` | 参考 A `styles.ts:19,33,36,39`；参考 C `lib/client.js:264-265` |
| 三级文本（说明/图例/轴） | `var(--dsw-alias-label-tertiary)` | 参考 B `lib/client.js:100-101`；参考 C `lib/client.js:264-265,276` |
| 强调/选中（下划线、链接按钮、焦点） | `var(--dsw-alias-brand-primary)` | 参考 A `styles.ts`（焦点环）→ 现状 `lib/client.js:49,55,63,73` |
| 热力图主色 | `var(--dsw-alias-state-business-primary, #4f8cff)` | 参考 C `lib/client.js:42,56`；**本机实证** `@nanmicoder/dsh-agent-teams/lib/client.js`、`skillhub-plugin/lib/client.js` |
| 热力图空格底色 | `color-mix(in srgb, var(--duc-heat-hue) 12%, transparent)` | 参考 C `lib/client.js:868-874`（`color-mix` + 令牌主色）；替代参考 A 的硬编码两套色（`styles.ts:80-89`） |
| 交互 hover 底色 | `var(--dsw-alias-interactive-bg-hover)` | 参考 B `lib/client.js:70,97,120`；参考 C `lib/client.js:42`；**本机实证** agent-teams |
| 错误态文本 | `var(--dsw-alias-state-error-primary)` | 参考 B `lib/client.js:75,102`；现状 `lib/client.js:61` |
| 主按钮填充（如需要） | `var(--dsw-alias-button-primary-fill)` + `var(--dsw-alias-label-primary-foreground)` | 参考 C `lib/client.js:42,56`；**本机实证** agent-teams（`label-primary-inverted`） |

> ⚠️ 名称陷阱（review 必须检查）：正确的令牌名是 `--dsw-alias-state-**warn**-primary`
> （参考 C `lib/client.js`、本机 agent-teams 均用 `warn`）；`--dsw-alias-state-warning-primary` 只出现在
> 参考 B 的 `lib/client.js:123`，属可疑拼写，**本项目不得使用**。

**图表私有调色板**（`:root` 内定义，供堆叠柱/环形/折线共用）：

```css
:root{
  /* 语义三段（堆叠顺序固定：新输入 → 输出 → 缓存命中） */
  --duc-c1:#4f8cff;  /* 新输入 / 累计折线 / 每周柱 */
  --duc-c2:#22c55e;  /* 输出 */
  --duc-c3:#f59e0b;  /* 缓存命中 / 命中率环形 */
  --duc-c4:#8b5cf6;  /* 备用第 4 色 */
  /* 模型色板（同一模型全页同色；取自参考 A hooks.ts:6 的 PALETTE） */
  --duc-m1:#4f8cff;--duc-m2:#22c55e;--duc-m3:#f59e0b;--duc-m4:#ec4899;--duc-m5:#8b5cf6;
  --duc-m6:#06b6d4;--duc-m7:#f97316;--duc-m8:#84cc16;--duc-m9:#e11d48;--duc-m10:#14b8a6;
  /* 热力图主色 + 几何（几何值必须与 JS 常量 HEAT 逐值一致） */
  --duc-heat-hue:var(--dsw-alias-state-business-primary,#4f8cff);
  --duc-heat-cell:10px;--duc-heat-gap:3px;--duc-heat-gutter:16px;--duc-heat-bodygap:5px;
}
@media (prefers-color-scheme: light){
  :root{--duc-c1:#2563eb;--duc-c2:#16a34a;--duc-c3:#d97706;--duc-c4:#7c3aed;}
}
```
（保留现有 `@media (prefers-color-scheme: light)` 覆盖机制，`lib/client.js:41-46`；
`--duc-h0..--duc-h4` **删除**，热力档位改由下面的 `color-mix` 生成。）

热力 5 档：
```css
.duc-u-heat-cell{width:var(--duc-heat-cell);height:var(--duc-heat-cell);border-radius:3px;
  background:color-mix(in srgb,var(--duc-heat-hue) 12%,transparent);}
.duc-u-heat-cell[data-l="1"]{background:color-mix(in srgb,var(--duc-heat-hue) 28%,transparent);}
.duc-u-heat-cell[data-l="2"]{background:color-mix(in srgb,var(--duc-heat-hue) 48%,transparent);}
.duc-u-heat-cell[data-l="3"]{background:color-mix(in srgb,var(--duc-heat-hue) 72%,transparent);}
.duc-u-heat-cell[data-l="4"]{background:var(--duc-heat-hue);}
.duc-u-heat-sel{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
```
（`data-l` 分档阈值逻辑不变：`lib/client.js:368,385`。）

### 9.2 字号层级（全部落地为 CSS 类，禁止再写内联 `fontSize`）

| 用途 | 字号/字重 | 颜色 |
| --- | --- | --- |
| 浮层标题 `.duc-overlay-title` | 14px / 600 | label-primary |
| 分区标签 `.duc-u-tabs button` | 13px / 400，选中 600 + 下划线 brand-primary | label-secondary → label-primary |
| 卡片标题 `h3`（`.duc-u-card-head h3`） | 13px / 600 | label-primary |
| 卡片副标题/提示 `.duc-hint` | 11px / 400 | label-secondary |
| KPI 标签 `.duc-u-tile-label` | 11px / 400 | label-secondary |
| KPI 数值 `.duc-u-tile-value` | **19px / 700** + `tabular-nums` | label-primary |
| KPI 数值（文本型）`.duc-u-tile-value.duc-u-txt` | **15px / 600** | label-primary |
| KPI 单位 `small` | 11px / 400 | label-secondary |
| KPI 说明行 `.duc-u-tile-sub` | 11px / 400，单行省略 | label-secondary |
| 次要指标条 `.duc-u-chip` / `i` | 11px / 400 | 值 label-primary；标签 label-secondary |
| 表格 `.duc-table` | 12px / 400；表头 11px | label-primary / 表头 label-secondary |
| 轴标签、热力图月份、星期 | 10px / 400 | label-secondary |
| 图例文字 | 11px / 400 | label-secondary |
| 标签 tag `.duc-u-tag` | 10px / 400，`border-l2`，`radius 4px`，`padding 0 5px`，`line-height 16px` | label-secondary |
| 分段控件 `.duc-u-seg button` | 11px / 400，选中 600 | label-secondary → label-primary |

（现状 `lib/client.js:504,538,618,639,692` 五处内联 `{fontSize:13,fontWeight:600}` 一律删除，
改由 `.duc-u-card-head h3` 承担；这是参考 A `styles.ts:30-31` 的做法。）

### 9.3 间距与圆角

| 项 | 值 | 依据 |
| --- | --- | --- |
| 浮层 body padding | 14px（现状不变） | `lib/client.js:54` |
| 页面纵向区块间距 `.duc-page{gap}` | 12px（现状不变） | `lib/client.js:57` |
| KPI 网格 gap | 10px | 参考 A `styles.ts:34` |
| KPI 卡内边距 | 12px 14px | 参考 A `styles.ts:35`（13px 15px）微调以适配 780px 浮层 |
| 卡片内边距 | 12px 14px | 参考 A `styles.ts:28`（14px 16px） |
| 卡片头与内容间距 | 10px | 参考 A `styles.ts:29`（12px） |
| 卡片圆角 | 12px | 参考 A `styles.ts:28` |
| 控件/输入框/分段圆角 | 8px | 参考 A `styles.ts:21,40` |
| 标签圆角 | 4px | 参考 A `styles.ts:108` |
| 图例色块 | 10×10，`radius 2px` | 参考 A `styles.ts:91` |
| 热力图格子 | 10×10，`radius 3px`，间距 3px，星期栏宽 16px，栏间距 5px | §6.2.4（参考 C `lib/client.js:263,270`） |
| 月份标签行高 | 14px，与网格间距 2px（= wrap `padding-top:16px`） | 现状 `lib/client.js:89-91` |
| 表格单元格内边距 | 5px 6px | 参考 A `styles.ts:60`（4px 6px） |

### 9.4 卡片与标签样式

```css
.duc-u-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
  border-radius:12px;padding:12px 14px;min-width:0;}
.duc-u-card-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}
.duc-u-card-head h3{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}
.duc-u-tile{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
  border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0;}
.duc-u-tag{font-size:10px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);
  border-radius:4px;padding:0 5px;line-height:16px;flex:none;}
```
- 所有数值文本统一 `font-variant-numeric:tabular-nums`。
- 表格数值列：`.duc-u-num{text-align:right;font-variant-numeric:tabular-nums;}`（保留现状，`lib/client.js:127`）。

### 9.5 热力图（汇总，实施以 §6.2.4 为准）

```css
.duc-u-heat-wrap{position:relative;padding-top:16px;}
.duc-u-heat-months{position:absolute;top:0;left:0;right:0;height:14px;}
.duc-u-heat-month{position:absolute;top:0;font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.duc-u-heat-body{display:flex;gap:var(--duc-heat-bodygap,5px);}
.duc-u-heat-weekdays{width:var(--duc-heat-gutter,16px);flex:none;text-align:right;display:flex;
  flex-direction:column;gap:var(--duc-heat-gap,3px);font-size:10px;color:var(--dsw-alias-label-secondary);}
.duc-u-heat-weekdays span{height:var(--duc-heat-cell,10px);line-height:var(--duc-heat-cell,10px);}
.duc-u-heat-cols{display:flex;gap:var(--duc-heat-gap,3px);}
.duc-u-heat-col{display:flex;flex-direction:column;gap:var(--duc-heat-gap,3px);}
.duc-u-heat-pad{width:var(--duc-heat-cell,10px);height:var(--duc-heat-cell,10px);border-radius:3px;background:transparent;}
.duc-u-heat-legend{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary);flex:none;}
.duc-u-heat-legend i{width:10px;height:10px;border-radius:2px;display:inline-block;}
.duc-u-tip{position:fixed;z-index:5;transform:translate(-50%,-100%);margin-top:-6px;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;
  padding:6px 8px;font-size:11px;line-height:1.5;white-space:nowrap;pointer-events:none;
  box-shadow:0 4px 14px rgba(0,0,0,.18);}
```

### 9.6 数值格式（中文数量级）

在 `lib/client.js:189-195` 位置用下面两个函数**替换** `fmtTokens`，并新增 `fmtCompact`：

```js
/** 完整数值：≥1e8 → 亿，≥1e4 → 万（去尾零），其余取整。单位与数字之间保留一个半角空格。 */
function fmtTokens(value) {
  const n = Math.round(Number(value) || 0)
  if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + ' 亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万'
  return String(n)
}
/** 坐标轴刻度：万取整、亿一位小数，数字与单位之间不留空格。 */
function fmtCompact(value) {
  const n = Math.round(Number(value) || 0)
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(0) + '万'
  return String(n)
}
```

规则表（验收逐条核对）：

| 场景 | 输入 | 期望输出 |
| --- | --- | --- |
| 卡片/表格/提示 | 39063000 | `3906.3 万` |
| 卡片/表格/提示 | 120000000 | `1.2 亿` |
| 卡片/表格/提示 | 100000000 | `1 亿` |
| 卡片/表格/提示 | 9860 | `9860` |
| 卡片/表格/提示 | 0 | `0` |
| 轴刻度 | 5000000 | `500万` |
| 轴刻度 | 150000000 | `1.5亿` |
| 请求数 / 次数 | 12345 | `12,345`（`toLocaleString`，不用 万） |
| 百分比（模型表 / 提示） | 0.3712 | `37.1%` |
| 百分比（命中率环形中心） | 0.942 | `94%`（`Math.round`） |
| 时长 | 8040000ms | `2h14m`（沿用 `fmtDur`） |

> 千分位规则：**Token 与次数不用千分位**，请求数/调用次数用 `toLocaleString()`（现状一致，`lib/client.js:318,514`）。

### 9.7 CSS/JS 变更清单（逐条）

在 `lib/client.js:37-140` 的样式表内：

1. `:root`（`:37-40`）替换为 §9.1 的变量块（删除 `--duc-h0..h4`）。
2. `@media (prefers-color-scheme: light)`（`:41-46`）只保留 `--duc-c1..c4` 覆盖。
3. `.duc-u-tabs`（`:70-73`）：保持；字号 13px 保留。
4. `.duc-u-seg button`（`:67-68`）：字号 12px→**11px**，padding `4px 12px`→`5px 11px`；
   `.on` 由 `button-primary-fill` 改为 `background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600`。
5. `.duc-u-tiles`（`:78`）：`minmax(150px,1fr)` → `minmax(190px,1fr)`，gap 8px→**10px**。
6. `.duc-u-tile`（`:79`）：radius 10px→**12px**，padding `10px 12px`→**`12px 14px`**。
7. `.duc-u-tile-value`（`:81`）：20px/600 → **19px/700**；新增 `.duc-u-tile-value.duc-u-txt{font-size:15px;font-weight:600;}`。
8. `.duc-u-tile-sub`（`:83`）：新增 `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`。
9. `.duc-u-sub`（`:75`）与 `.duc-u-chip`（`:76-77`）：保持结构，字号统一 11px。
10. 热力图 6 条规则（`:89-99`）按 §9.5 替换；删除 `--duc-h*` 相关引用；
    新增 `.duc-u-heat-legend` / `.duc-u-heat-legend i`。
11. `.duc-u-tip`（`:128`）：`position:absolute` → **`position:fixed`**；
    触发端（`:390-399`）由 `offsetLeft/offsetTop` 改为
    `const rect = e.currentTarget.getBoundingClientRect(); setTip({ x: rect.left + rect.width / 2, y: rect.top - 6, ... })`
    （参考 A `Heatmap.tsx:56-64`、参考 C `lib/client.js:1800-1802`）。
    渲染端（`:423-426`）保持 `left: tip.x + 'px'; top: tip.y + 'px'`。
12. `.duc-u-card`（`:120`）：radius 10px→**12px**，padding `10px 12px`→**`12px 14px`**。
13. `.duc-u-card-head`（`:121`）：`margin-bottom:8px`→**`10px`**；新增 `.duc-u-card-head h3{...13px/600}`。
14. `.duc-u-num`、`.duc-table`、`.duc-u-empty`：保持；表格行 padding `4px 6px`→**`5px 6px`**。
15. 删除所有组件内的内联 `{fontSize:13, fontWeight:600}`（`:504,538,618,639,692` 等处），改由类承担。
16. 新增 `.duc-u-rank-row/.duc-u-rank-no/.duc-u-rank-name/.duc-u-rank-date/.duc-u-rank-tokens`（§8.6）。
17. 新增 `.duc-u-heat-month[data-col]` 无需样式，仅用于测试定位。

---

## 10. 功能清单与本期取舍

「本期」= P0 + P1，都必须在 t6 落地；P2 = 明确不做，本期内不得实现（评审发现即算越界）。

| # | 项 | 优先级 | 验收口径 |
| --- | --- | --- | --- |
| 1 | 月份标签像素对齐 | **P0** | 每个 `.duc-u-heat-month` 的 `style.left === (16+5+13×col)+'px'`；`data-col` 存在；首列 = `21px`；与对应 `.duc-u-heat-col` 左边缘一致（含 13/14 列两种窗口） |
| 2 | 星期栏固定宽度 + 行对齐 | **P0** | `.duc-u-heat-weekdays` 宽度固定 16px；`一/三/五` 分别在第 0/2/4 行（与格子行同一 y）；行序仍为周一→周日 |
| 3 | Codex 指标卡补回 | **P0** | KPI 网格渲染 **6 张** `.duc-u-tile`；文案包含 `总消耗`、`请求数`、`缓存命中率`、`连续天数`、`单会话峰值`、`最长聊天`；**全文不得出现第二处 `累计 Token`** |
| 4 | 视觉规范落地 | **P0** | §9.1-9.5 的令牌、字号、间距、圆角、卡片/标签样式逐条可见于 CSS（评审逐条 grep 比对） |
| 5 | 中文数量级格式 | **P0** | §9.6 规则表逐行成立；`K/M/B` 不再出现在任何输出路径 |
| 6 | 热力图图例 | **P0** | 卡片头右侧出现 `少` + 4 个色块 + `多`（`.duc-u-heat-legend`） |
| 7 | 既有能力回归 | **P0** | 三视图、点击联动当日明细、`查看该日调用 →` 跳转、跨分区保留选中、悬浮提示、90 天连续窗口 + 缺失补零 + 时钟漂移锚定、范围切换与刷新、模型筛选、日期清除——全部保持且测试断言继续通过 |
| 8 | 悬浮提示定位改 fixed | P1 | `.duc-u-tip` 为 `position:fixed`，坐标来自 `getBoundingClientRect()`（不被浮层滚动裁剪） |
| 9 | 模型表命中率列 | P1 | 表头出现 `命中率`；值 = `cacheRead/input*100` 保留 1 位小数；`input=0` 显示 `—` |
| 10 | 会话用量排行卡 | P1 | `stats.sessions` 非空时渲染前 10 行，含 排名/标题/日期/Token；标题为空时显示 `未命名会话`；`sessions` 为空时整卡不渲染 |
| 11 | 服务商用量卡 | **P2 不做** | 宿主未采集 provider（`lib/index.js:82-200` 无该维度），本期不引入宿主改动 |
| 12 | 费用估算 / 预算告警 | **P2 不做** | 无价目数据源；参考 A 已把该两项列为 no-go（`docs/P2-decisions.md:1-25`） |
| 13 | 导出 CSV / JSON | **P2 不做** | 需要客户端拼装或新增 RPC，超出本轮 UI 重做范围 |
| 14 | 趋势柱自绘 tooltip（含按模型拆分） | **P2 不做** | 需要把 `dailyModels` 传入趋势视图并新增浮层；下一期（参考 A 的做法见 `BarChart.tsx:102-119`） |
| 15 | 年视图 / 月份翻页日历 | **P2 不做** | 与「最近 90 天连续窗口」口径冲突（团队既定口径，`lib/client.js:216-249`） |
| 16 | 英文 i18n | **P2 不做** | 需要注入 `locale` 服务并改造全部文案（参考 A `index.tsx:13,26-29`）；当前全中文 |

---

## 11. 验收口径与测试要求

### 11.1 命令
```bash
npm run check   # node --check
npm test        # 宿主 14 + 客户端 32 项断言
```

### 11.2 必须在 `test/client-render.mjs` 中新增/更新的断言

新增（`findByClass` 已可复用，见 `test/client-render.mjs:274-282` 的用法）：
1. **月份标签像素对齐**：取全部 `.duc-u-heat-month` 节点，按下式逐条核对
   ```js
   const cols = colNodes.length
   labels.forEach((n, i) => n.props.style.left === (HEAT.gutter + HEAT.bodyGap + n.props['data-col'] * (HEAT.cell + HEAT.gap)) + 'px')
   // 等价硬编码：(16 + 5 + 13 * col) + 'px'，首列必须 === '21px'
   ```
   并断言标签所在列与其取月规则一致（`col*7 - lead` 落在该月的第一天所属列）。
2. **星期栏固定宽度**：`findByClass(tree,'duc-u-heat-weekdays')[0]` 存在 7 个子 span，第 0/2/4 个文本为 `一/三/五`，其余为空串。
3. **KPI 卡数量与去重**：`.duc-u-tile` 数量 === 6；全文文案包含 `单会话峰值`/`最长聊天`/`连续天数`；**不包含** `累计 Token`。
4. **数值格式**：构造 39,063,000 tokens 的 payload，断言页面文案包含 `3906.3 万`；构造 1.2e8 断言包含 `1.2 亿`。
5. **图例**：`.duc-u-heat-legend` 存在且含 `少`、`多`。
6. **浮层定位**：`.duc-u-tip` 类名不变；模拟 `onMouseEnter` 的 `currentTarget.getBoundingClientRect` 桩，断言 tip 的 `style.left` 为数值 px 字符串。

必须更新（否则必然失败）：
7. 测试内自带的 `fmtTokens`（`test/client-render.mjs:215-220`）目前是 `K/M/B`，需同步改为 万/亿。
8. 原断言「次要指标：单会话峰值与最长聊天在同一行」（`test/client-render.mjs:268-271`）语义已变：
   改判为「`单会话峰值`/`最长聊天` 出现在 `.duc-u-tile` 卡片中，次要指标条只剩 轮次/步数、耗时、性能」。
9. 原断言「瓦片 4 张」（`test/client-render.mjs:265-266`）需改为 6 张（`!all.includes('累计 Token')` 的部分保留）。
10. **悬浮提示桩**：现有 3 处 `onMouseEnter({ currentTarget: { offsetLeft, offsetTop } })`
    （`test/client-render.mjs:305,376,467`）在改为 `getBoundingClientRect()` 后必须补桩，
    否则抛 `TypeError`。桩形如
    `{ currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 200, width: 10, height: 10 }) } }`。

不得削弱（沿用现有断言，语义不变）：
11. 90 天窗口 13–14 列 × 7 行、缺失日补 `level 0`、占位格与数据格分离、逐格悬浮回读日期连续无跳格、
    行序与真实星期对齐、每周柱数 = 每日列数、累计 90 点且末值 = 窗口内总量、未来日期锚定（`test/client-render.mjs:279-330,415-465`）。

### 11.3 验证者（t7）的独立复算方式（不得读实现常量）
```
① 从 CSS 读出列宽 10px、列间距 3px、星期栏固定宽 16px、星期栏与格子区间距 5px；
② 期望 label(col).left = 16 + 5 + 3*col + 10*col；
③ 与渲染树中每个 .duc-u-heat-month 的 style.left 逐一比对；
④ 断言首列 = 21px，最后一列 = 21 + 13*(列数-1) px。
```

---

## 12. 附录：证据索引

**参考 A `AlfredChaos_dsh-usage-panel`**
`src/client/index.tsx:32-42`、`src/client/StatsSection.tsx:23,80-90,112-120,128-156`、
`src/client/components/KpiCards.tsx:32-69`、`src/client/components/Heatmap.tsx:29-31,56-64,71,80-86,88-106`、
`src/client/components/BarChart.tsx:22,32-33,45-57,102-119,143-149,151-155`、
`src/client/components/ModelDonut.tsx:30-64,66-79,97-106`、`src/client/components/SessionsCard.tsx:18,22-26,36-44`、
`src/client/components/ProvidersCard.tsx:15-38`、`src/client/hooks.ts:6,20-54,57-74,111-116`、
`src/client/locales.ts:11-129`、`src/client/styles.ts:7,8,16,19,21,28-43,45,47-48,60-61,67-79,80-91,103-110`、
`src/shared/format.ts:13-24,27-38,41-44,47-53,56-67,70-81,97-103`、`docs/P2-decisions.md:1-40`。
截图：`/tmp/refs/shots/screenshot-overview.png`、`screenshot-sessions.png`、`screenshot-hover-bar.png`。

**参考 B `Ychris12138_dsh-usage-stats`**
`lib/client.js:69-200,363-378,677-691,1145,1178,1195-1211,1221-1264,1265-1290,1291-1310,1311-1319,1673-1725,1732-1786`。

**参考 C `wannanbigpig_dsh-usage-stats`**
`lib/client.js:42,56,225-238,2524-2563,260-277,868-874,1759-1819,5645-5763`。

**new-api（GitHub 主干 `Calcium-Ion/new-api`）**
`web/src/features/dashboard/section-registry.tsx:25-47`、
`web/src/features/dashboard/constants.ts:26-62`、
`web/src/features/dashboard/components/overview/summary-cards.tsx:232-282,291-350`、
`web/src/features/dashboard/components/ui/stat-card.tsx:26-49`、
`web/src/features/dashboard/components/models/model-charts.tsx:44-49,122-160`、
`web/src/features/dashboard/components/models/consumption-distribution-chart.tsx:53-58`、
`web/src/features/dashboard/components/models/log-stat-cards.tsx:48-56,136-137`、
`web/src/features/dashboard/components/users/user-charts.tsx:58,202-216`、
`web/src/features/dashboard/components/flow/flow-charts.tsx:456-463`。

**本项目现状**
`lib/client.js:37-140,189-195,216-249,290-351,357-427,502-518,521-558,560-631,633-682,684-738,743-813`、
`lib/index.js:16-42,69-80,276-383,410-427`、`test/client-render.mjs:215-220,265-330,406-465`。
