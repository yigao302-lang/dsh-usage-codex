# dsh-usage-codex

> Codex 风格的 DeepSeek Harness 用量统计面板：指标卡 · 三视图热力图 · 点击某天联动当日明细。

本项目是 [dsh-balance-plugin](https://github.com/yxxbc/dsh-balance-plugin)（MIT，作者 yxxbc）的衍生项目：
**只保留用量统计模块**，去掉了余额监控、官方充值、三方插件管理与插件自更新，并在此基础上按 Codex
个人用量页的口径做了功能增强。原始版权声明见 [LICENSE](LICENSE)。

## 功能

| 模块 | 说明 |
| --- | --- |
| **Codex 指标卡** | 累计 Token · 单会话峰值 Token · 最长聊天时长 · 连续天数（当前 / 最长） |
| **三视图热力图** | 每日（GitHub 贡献图网格）/ 每周（柱状）/ 累计（折线）三态切换 |
| **自定义悬浮提示** | 悬停任一格子显示该日 Token、请求数、轮次 / 步数 / 工具调用，替代浏览器原生 title |
| **点击联动** | 点击某一天 → 展开「当日明细」（该日按模型的 Token 分布），并按需拉取该日调用明细替换下方表格；再次点击或「✕ 清除」取消 |
| **原有统计** | 范围切换（1 天 / 7 天 / 30 天 / 至今）、消耗瓦片、缓存命中率环、按模型分布、调用明细 |
| **实时性能指标** | 轮次 · 步数 · LLM 时长 · 工具调用时长 · 首 token 平均延迟 · tok/s |

数据来源是 DSH 的会话 API（`sessionQuery.listSessions()` / `readSession()`）回放全部会话事件，
**不依赖会话日志的文件名**，因此对带版本号的日志（如 `session.v4.jsonl.zstd`）同样有效。
插件只聚合数字，不读取对话正文。

## 安装

```sh
dsh plugin --profile <profile> add github:gaoyifei/dsh-usage-codex
```

本地开发（改完刷新页面即生效，宿主端改动需重启 DSH）：

```sh
dsh plugin --profile <profile> add link:/绝对路径/dsh-usage-codex
```

安装后重启 DeepSeek Harness，入口在**输入框工具行右侧的柱状图图标**。

## 数据口径

- Token 总量 = 输入（含缓存读）+ 输出；输出已含思考 token，不重复累加。
- 连续天数按**日历相邻**判定（非毫秒差），跨夏令时安全；今天没有用量时从昨天起算。
- 单会话峰值 / 最长聊天时长按会话聚合，取会话首末事件时间之差。
- 热力图与连续天数使用**全量历史**（宿主保留最近 90 天），不受范围切换影响；
  消耗瓦片、按模型分布与调用明细仍按所选范围返回。

## 开发

```sh
npm run check     # 语法检查（node --check）
npm test          # 回归测试，共 29 项断言
```

- `lib/index.js` — 宿主端：会话事件回放、按天 / 按模型 / 按会话聚合、`/dsh-usage-codex/api/*` 路由。
- `lib/client.js` — 浏览器端：React.createElement 手写组件，无构建步骤；改完刷新页面即生效。

测试构成：

| 文件 | 覆盖 |
| --- | --- |
| `test/host-smoke.mjs` | 用合成会话事件驱动真实宿主代码，断言 `dailyAll` / `sessionPeak` / `longestChat` / `streaks` / `dailyModels` 字段与取值；并从 `lib/client.js` 源码提取客户端实际读取的字段，反向断言宿主全部提供（防字段漂移） |
| `test/client-render.mjs` | 最小 React 桩 + `node:vm` 沙箱加载真实 client bundle，渲染组件树并模拟「点开入口 → 点击某天 → 悬浮 → 切换三视图」交互 |

两者都不需要启动 DSH，可在 CI 中直接运行。

## 许可证

MIT。衍生自 yxxbc/dsh-balance-plugin，原始版权声明已按 MIT 条款保留。
