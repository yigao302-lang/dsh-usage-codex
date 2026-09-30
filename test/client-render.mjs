// dsh-usage-codex 客户端渲染冒烟测试
// 用最小 React 桩在 vm 沙箱里加载真实 client bundle，渲染组件树并模拟交互，
// 用于在没有 DSH 宿主的情况下捕获运行时错误与接线错误。
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const CLIENT = process.argv[2] || new URL('../lib/client.js', import.meta.url).pathname

// ---------- 最小 React ----------
let current = null
const React = {
  createElement(type, props, ...children) {
    const p = Object.assign({}, props || {})
    const flat = children.flat(Infinity).filter((c) => c !== undefined && c !== null && c !== false)
    if (flat.length) p.children = flat
    return { type, props: p }
  },
  useState(initial) {
    const inst = current
    const i = inst.h++
    if (!(i in inst.hooks)) inst.hooks[i] = typeof initial === 'function' ? initial() : initial
    const set = (value) => {
      const next = typeof value === 'function' ? value(inst.hooks[i]) : value
      if (next !== inst.hooks[i]) { inst.hooks[i] = next; inst.dirty = true }
    }
    return [inst.hooks[i], set]
  },
  useRef(value) {
    const inst = current
    const i = inst.h++
    if (!(i in inst.hooks)) inst.hooks[i] = { current: value }
    return inst.hooks[i]
  },
  useEffect(fn, deps) {
    const inst = current
    const i = inst.h++
    const prev = inst.hooks[i]
    const list = deps || null
    // 忠实一点：依赖变化时重新执行，否则 useDayRecords 这类按需请求测不到。
    const changed = !prev || !list || !prev.deps || prev.deps.length !== list.length
      || list.some((dep, k) => dep !== prev.deps[k])
    if (changed) { inst.hooks[i] = { deps: list ? list.slice() : null }; fn() }
  },
}

// ---------- 极简渲染器（按路径缓存组件实例） ----------
const instances = new Map()
function render(el, path) {
  if (el === null || el === undefined || el === false || el === true) return null
  if (typeof el === 'string' || typeof el === 'number') return el
  if (Array.isArray(el)) return el.map((child, i) => render(child, path + '/' + i))
  const type = el.type
  const props = el.props || {}
  const kids = props.children || []
  if (typeof type === 'function') {
    const key = path + '::' + (type.name || 'anon')
    let inst = instances.get(key)
    if (!inst) { inst = { hooks: {}, h: 0, dirty: false }; instances.set(key, inst) }
    const prev = current
    current = inst
    inst.h = 0
    let out
    try {
      out = type(Object.assign({}, props, { children: kids }))
    } finally {
      current = prev
    }
    return render(out, key + '>')
  }
  return { host: type, props, children: kids.map((child, i) => render(child, path + '/' + i)) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function renderTree(rootFn, rounds = 6) {
  let tree = render(rootFn(), 'root')
  for (let i = 0; i < rounds; i += 1) {
    await sleep(8)
    const dirty = [...instances.values()].some((inst) => inst.dirty)
    if (!dirty) break
    for (const inst of instances.values()) inst.dirty = false
    tree = render(rootFn(), 'root')
  }
  return tree
}
function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  if (typeof node !== 'object') { visit(node); return }
  if (node.host) { visit(node); (node.children || []).forEach((child) => walk(child, visit)); return }
}
function texts(node) {
  const out = []
  walk(node, (n) => { if (typeof n === 'string') out.push(n) })
  return out
}
function findByClass(node, cls) {
  const hits = []
  walk(node, (n) => {
    if (n && n.props && typeof n.props.className === 'string' && n.props.className.includes(cls)) hits.push(n)
  })
  return hits
}
function findByText(node, text) {
  const hits = []
  const search = (n) => {
    if (n === null || n === undefined) return
    if (Array.isArray(n)) { n.forEach(search); return }
    if (typeof n !== 'object') return
    if (n.props && n.props.children) {
      const flat = [].concat(n.props.children).filter((c) => typeof c === 'string')
      if (flat.some((c) => c.includes(text))) { hits.push(n); return }
    }
    if (n.children) n.children.forEach(search)
  }
  search(node)
  return hits
}

// ---------- 合成数据 ----------
const DAY = 86400000
const dayKey = (ms) => {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
const now = Date.now()
const mkDay = (offset, total) => ({
  date: dayKey(now - offset * DAY), requests: Math.max(1, Math.round(total / 900)),
  prompt: Math.round(total * 0.7), completion: Math.round(total * 0.3),
  cache_read: Math.round(total * 0.4), total, tools: 3, turns: 2, steps: 5,
})
const dailyAll = []
// 刻意放一天 90 天窗口之外（120 天前）的巨额数据：窗口化的三视图与卡片摘要
// 都不得被它计入总量或拉高分档基准，否则「窗口内」口径会被击穿。
dailyAll.push(mkDay(120, 5000000))
for (let i = 29; i >= 0; i -= 1) dailyAll.push(mkDay(i, i % 4 === 3 ? 0 : 40000 + i * 1500))
const daily = dailyAll.slice(-7)
// 会话排行：12 条（验证只取前 10）；第 4 条标题为空 → 「未命名会话」，第 8 条 endedAt 为空 → 「—」
const sessions = []
for (let i = 0; i < 12; i += 1) {
  sessions.push({
    id: 'sess-' + String(i + 1).padStart(4, '0'),
    title: i === 3 ? '' : ('会话 ' + (i + 1)),
    tokens: 9000000 - i * 500000,
    requests: 100 - i,
    startedAt: now - (i + 5) * DAY,
    endedAt: i === 7 ? null : now - (i + 1) * DAY,
    durationMs: 3600000,
  })
}
const stats = {
  totals: { total: 1234567, prompt: 900000, completion: 334567, cache_read: 500000, requests: 42, turns: 10, steps: 20, tools: 30 },
  prevTotals: { total: 1000000, requests: 40 },
  daily,
  dailyAll,
  dailyModels: { [daily[daily.length - 2].date]: [{ model: 'gpt-6-sol', tokens: 12000, requests: 4 }] },
  sessions,
  models: [
    { model: 'gpt-6-sol', requests: 10, input: 100, output: 50, cacheRead: 20, total: 170 },
    { model: 'deepseek-flash', requests: 4, input: 0, output: 30, cacheRead: 0, total: 30 },
  ],
  records: [{ time: now - 3600000, sessionId: 'abcd1234', model: 'gpt-6-sol', input: 100, output: 50, cacheRead: 20 }],
  live: { turns: 1, steps: 2, llmMs: 1234, toolMs: 567, toolCalls: 3, firstTokenMs: 1.2, firstTokenCount: 3, tokPerSec: 42 },
  sessionPeak: { tokens: 8750, title: '大会话', date: dailyAll[10].date },
  longestChat: { durationMs: 7200000, title: '大会话', id: 's-big' },
  streaks: { current: 3, longest: 5 },
}
const payload = { ok: true, version: 7, ready: true, updatedAt: now, error: null, stats }

// 该日调用明细：模拟宿主 get-day-records 路由的返回
const clickedDate = dailyAll[dailyAll.length - 1].date
const dayRecords = [
  { time: now - 3600000, sessionId: 'aaaa1111', model: 'gpt-6-sol', input: 900, output: 120, cacheRead: 300 },
  { time: now - 7200000, sessionId: 'bbbb2222', model: 'deepseek-flash', input: 500, output: 80, cacheRead: 100 },
]
const DAY_RECORDS = { [clickedDate]: dayRecords }
let activePayload = payload
const requestedRoutes = []
const requestedCalls = []

// ---------- 沙箱加载真实 bundle ----------
let captured = null
// 捕获插件注入的样式表文本：视觉规范（令牌/字号/几何/圆角）按真实 CSS 断言，而不是只信组件树。
let capturedCss = ''
const sandbox = {
  window: { __ModuleLoader__: { load: (mod) => { captured = mod } } },
  document: {
    createElement: () => ({
      set textContent(value) { capturedCss += String(value) },
      get textContent() { return capturedCss },
      remove() {},
    }),
    head: { appendChild() {} },
  },
  fetch: async (url, options) => {
    const route = String(url)
    requestedRoutes.push(route)
    const body = JSON.parse((options && options.body) || '{}')
    requestedCalls.push({ route: route, body: body })
    if (route.includes('get-day-records')) {
      return { ok: true, status: 200, json: async () => ({ date: body.date, records: DAY_RECORDS[body.date] || [] }) }
    }
    return { ok: true, status: 200, json: async () => activePayload }
  },
  console,
  setTimeout,
  clearTimeout,
}
vm.createContext(sandbox)
vm.runInContext(readFileSync(CLIENT, 'utf8'), sandbox, { filename: CLIENT })
if (!captured) { console.error('FAIL: bundle 未调用 __ModuleLoader__.load'); process.exit(1) }
const exportsObj = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})

const moduleId = captured.id
let slotRender = null
const slots = {
  inject(name, cb) { cb() },
  register(meta, renderFn) { slotRender = renderFn },
}
exportsObj.apply({
  get: (name) => (name === 'slots' ? slots : undefined),
  interval: () => () => {},
})

const checks = []
const check = (name, ok, detail) => checks.push({ name, ok, detail: detail === undefined ? '' : String(detail) })

// ---------- 期望模型：独立于被测实现推导窗口语义 ----------
// 与实现无关地从「今天」按本地日历逐日回推，得到期望的连续 90 天窗口。
const WINDOW_DAYS = 90
const parseKey = (key) => { const p = String(key).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]) }
const keyOfDate = (d) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())
const mondayKeyOf = (key) => {
  const d = parseKey(key)
  return keyOfDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)))
}
const weekLabelOf = (key) => { const d = parseKey(key); return (d.getMonth() + 1) + '/' + d.getDate() }
// 中文数量级格式（§9.6）：与实现独立复刻，用于逐条核对页面文案
const fmtTokens = (value) => {
  const n = Math.round(Number(value) || 0)
  if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + ' 亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万'
  return String(n)
}
const fmtCompact = (value) => {
  const n = Math.round(Number(value) || 0)
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(0) + '万'
  return String(n)
}
// 热力图几何（§6.2.4 由规格独立给出，不读实现常量）
const HEAT_GEO = { cell: 10, gap: 3, gutter: 16, bodyGap: 5 }
const labelLeftOf = (col) => HEAT_GEO.gutter + HEAT_GEO.bodyGap + col * (HEAT_GEO.cell + HEAT_GEO.gap)
const rectOf = (left, top) => ({ left, top, width: HEAT_GEO.cell, height: HEAT_GEO.cell })
const todayDate = new Date(now)
const expectWindow = []
for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
  expectWindow.push(keyOfDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - offset)))
}
const expectWeeks = []
for (let cursor = parseKey(mondayKeyOf(expectWindow[0])); ; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)) {
  const cursorKey = keyOfDate(cursor)
  expectWeeks.push(cursorKey)
  if (cursorKey === mondayKeyOf(expectWindow[expectWindow.length - 1])) break
}
const inWindow = new Set(expectWindow)
const byDate = new Map(dailyAll.map((d) => [d.date, d]))
const windowTotals = expectWindow.map((key) => (byDate.get(key) ? byDate.get(key).total : 0))
const windowMax = Math.max(1, ...windowTotals)
const expectLevel = (total) => (total === 0 ? '0' : String(Math.min(4, 1 + Math.floor((total / windowMax) * 3.99))))
const missingInWindow = expectWindow.filter((key) => !byDate.has(key)).length
const expectTotals = dailyAll.filter((d) => inWindow.has(d.date))
const expectTokens = expectTotals.reduce((sum, d) => sum + d.total, 0)
const expectRequests = expectTotals.reduce((sum, d) => sum + d.requests, 0)

if (!slotRender) { console.error('FAIL: 未注册插槽渲染函数'); process.exit(1) }
let tree = await renderTree(() => slotRender())
let all = texts(tree).join(' | ')

check('bundle id 为 dsh-usage-codex', moduleId === 'dsh-usage-codex', 'id=' + moduleId)
check('入口按钮已注册', findByClass(tree, 'duc-ibar').length > 0, '')

// 点开入口 → 浮层内才是用量页
const entryBtn = findByClass(tree, 'duc-ibar').find((n) => typeof n.props.onClick === 'function')
entryBtn.props.onClick()
tree = await renderTree(() => slotRender())
all = texts(tree).join(' | ')
check('点开后浮层渲染用量页', all.includes('用量统计') && all.includes('用量日历'), all.slice(0, 60))
// 分区标签页：概览 / 趋势 / 明细
const tabBtns = findByClass(tree, 'duc-u-tabs').flatMap((n) => [].concat(n.props.children || []))
  .filter((n) => n && typeof n.props.onClick === 'function')
check('顶部为「概览 / 趋势 / 明细」三个分区标签',
  tabBtns.map((n) => [].concat(n.props.children).join('')).join(',') === '概览,趋势,明细',
  tabBtns.map((n) => [].concat(n.props.children).join('')).join(','))
// 指标区：6 张 KPI 卡（Codex 指标以卡片补回），重复的「累计 Token」与「总消耗」同源只留一张
const primaryTiles = findByClass(tree, 'duc-u-tile').filter((n) => n.props.className === 'duc-u-tile')
const tileText = primaryTiles.map((t) => texts(t).join(' '))
check('KPI 为 6 张卡片，Codex 指标以卡片形式补回',
  primaryTiles.length === 6
    && ['总消耗', '请求数', '缓存命中率', '连续天数', '单会话峰值', '最长聊天'].every((label) => tileText.some((t) => t.startsWith(label))),
  primaryTiles.length + ' 张：' + tileText.map((t) => t.split(' ')[0]).join(' / '))
check('「累计 Token」与「总消耗」同源，全页只呈现一次',
  tileText.some((t) => t.startsWith('总消耗')) && !all.includes('累计 Token') && tileText.filter((t) => t.startsWith('总消耗')).length === 1,
  '')
check('Codex 指标卡内容：单会话峰值 / 最长聊天 / 连续天数',
  tileText.some((t) => t.includes('单会话峰值') && t.includes(fmtTokens(stats.sessionPeak.tokens)) && t.includes('大会话'))
    && tileText.some((t) => t.includes('最长聊天') && t.includes('2h') && t.includes('大会话'))
    && tileText.some((t) => /连续天数 3 天 最长 5 天/.test(t)),
  tileText.filter((t) => /单会话峰值|最长聊天|连续天数/.test(t)).join(' ｜ '))
const chips = findByClass(tree, 'duc-u-chip')
check('次要指标条只剩 轮次/步数、耗时、性能，不再重复 Codex 指标',
  chips.length === 3
    && ['轮次/步数', '耗时', '性能'].every((label) => chips.some((c) => texts(c).join(' ').includes(label)))
    && chips.every((c) => !/单会话峰值|最长聊天|连续天数/.test(texts(c).join(' '))),
  chips.map((c) => texts(c).join(' ').slice(0, 12)).join(' / '))
check('热力图三视图按钮', all.includes('每日') && all.includes('每周') && all.includes('累计'), '')

// ---------- 热力图几何：月份标签像素定位 + 星期栏固定宽 ----------
// 注意 .duc-u-heat-months（容器）也包含子串 'duc-u-heat-month'，必须按完整类名取标签
const monthLabelNodes = findByClass(tree, 'duc-u-heat-month').filter((n) => n.props.className === 'duc-u-heat-month')
const colNodes0 = findByClass(tree, 'duc-u-heat-col').filter((n) => n.props.className === 'duc-u-heat-col')
const leadOfWindow = (parseKey(expectWindow[0]).getDay() + 6) % 7
check('月份标签按像素定位并计入列宽 10px + 列间距 3px（不再是列号/列数的百分比）',
  monthLabelNodes.length >= 3
    && monthLabelNodes.every((n) => {
      const col = Number(n.props['data-col'])
      return Number.isInteger(col) && col >= 0 && col < colNodes0.length && n.props.style.left === labelLeftOf(col) + 'px'
    }),
  monthLabelNodes.map((n) => n.props['data-col'] + '→' + n.props.style.left).join(' '))
check('首列标签左边缘对齐第 0 列（21px = 星期栏 16 + 栏间距 5），末列 = 21 + 13×(列数−1)',
  monthLabelNodes[0].props['data-col'] === '0' && monthLabelNodes[0].props.style.left === '21px'
    && labelLeftOf(colNodes0.length - 1) === 21 + 13 * (colNodes0.length - 1),
  '首列 ' + monthLabelNodes[0].props.style.left + ' · 末列 col ' + (colNodes0.length - 1) + ' → ' + labelLeftOf(colNodes0.length - 1) + 'px')
// 验收不变式（不读实现常量，直接按 16 + 5 + 13×col 复算）：13 列末列 177px、14 列末列 190px
check('月份标签不变式 label(col) = 16 + 5 + 13×col：21 / 177 / 190',
  labelLeftOf(0) === 21 && labelLeftOf(12) === 177 && labelLeftOf(13) === 190
    && monthLabelNodes[0].props.style.left === labelLeftOf(0) + 'px',
  'label(0)=' + labelLeftOf(0) + 'px · label(12)=' + labelLeftOf(12) + 'px · label(13)=' + labelLeftOf(13) + 'px')
check('月份标签取月规则不变（该列第一格所在月份）',
  monthLabelNodes.every((n) => {
    const col = Number(n.props['data-col'])
    const idx = Math.min(Math.max(0, col * 7 - leadOfWindow), WINDOW_DAYS - 1)
    return texts(n).join('') === (parseKey(expectWindow[idx]).getMonth() + 1) + '月'
  }),
  monthLabelNodes.map((n) => texts(n).join('')).join(','))
const weekdayCol = findByClass(tree, 'duc-u-heat-weekdays')[0]
const weekdaySpans = weekdayCol ? (weekdayCol.children || []).map((n) => texts(n).join('')) : []
check('星期栏固定 7 行，一/三/五 落在第 0/2/4 行（行序 周一→周日）',
  weekdaySpans.length === 7 && weekdaySpans[0] === '一' && weekdaySpans[2] === '三' && weekdaySpans[4] === '五'
    && weekdaySpans.filter((t) => t !== '').length === 3,
  JSON.stringify(weekdaySpans))
const legendNodes = findByClass(tree, 'duc-u-heat-legend')
check('热力图卡片头出现「少 [4 色块] 多」图例',
  legendNodes.length === 1 && /少/.test(texts(legendNodes[0]).join('')) && /多/.test(texts(legendNodes[0]).join(''))
    && (legendNodes[0].children || []).filter((n) => n.host === 'i').length === 4,
  '图例项 ' + (legendNodes[0] ? legendNodes[0].children.length : 0))
const cssRules = [
  // §9.1 令牌与调色板
  '--duc-heat-hue:var(--dsw-alias-state-business-primary,#4f8cff)',
  '--duc-m1:#4f8cff', '--duc-m10:#14b8a6',
  // §9.2 字号层级
  '.duc-u-tabs button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 14px;font-size:13px',
  '.duc-u-card-head h3{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}',
  '.duc-hint{font-size:11px;',
  '.duc-u-chip{font-size:11px;',
  '.duc-u-tag{font-size:10px;',
  '.duc-u-heat-legend{display:flex;align-items:center;gap:5px;font-size:11px;',
  '.duc-u-week-x{font-size:10px;',
  '.duc-table{border-collapse:collapse;width:100%;font-size:12px;}',
  '.duc-u-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 11px;font-size:11px',
  '.duc-u-seg button.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;}',
  // §9.3 间距与圆角
  '.duc-u-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;}',
  '.duc-u-tile{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px',
  '.duc-u-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;',
  '.duc-u-card-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}',
  '.duc-table th,.duc-table td{border-bottom:1px solid var(--dsw-alias-border-l1);padding:5px 6px;',
  '.duc-u-tag{font-size:10px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:0 5px;line-height:16px;',
  '.duc-u-heat-legend i{width:10px;height:10px;border-radius:2px;display:inline-block;}',
  // §6.2.4 几何单一来源：body / cols / col / cell / pad 全部走同一组变量
  '.duc-u-heat-body{display:flex;gap:var(--duc-heat-bodygap,5px);}',
  '.duc-u-heat-cols{display:flex;gap:var(--duc-heat-gap,3px);}',
  '.duc-u-heat-col{display:flex;flex-direction:column;gap:var(--duc-heat-gap,3px);}',
  '.duc-u-heat-cell{width:var(--duc-heat-cell,10px);height:var(--duc-heat-cell,10px);border-radius:3px;',
  '.duc-u-heat-pad{width:var(--duc-heat-cell,10px);height:var(--duc-heat-cell,10px);border-radius:3px;background:transparent;}',
  // §9.4 / §9.5 卡片与热力 5 档
  '.duc-u-tile-sub{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.duc-u-heat-cell[data-l="1"]{background:color-mix(in srgb,var(--duc-heat-hue) 28%,transparent);}',
  '.duc-u-heat-cell[data-l="2"]{background:color-mix(in srgb,var(--duc-heat-hue) 48%,transparent);}',
  '.duc-u-heat-cell[data-l="3"]{background:color-mix(in srgb,var(--duc-heat-hue) 72%,transparent);}',
  '.duc-u-heat-cell[data-l="4"]{background:var(--duc-heat-hue);}',
  '.duc-u-num{text-align:right;font-variant-numeric:tabular-nums;}',
]
const missingRules = cssRules.filter((rule) => !capturedCss.includes(rule))
check('CSS 逐条落地 §9 视觉规范（令牌 × 字号层级 × 间距圆角 × 卡片间距 × 热力 5 档）',
  missingRules.length === 0,
  missingRules.length ? ('缺失 ' + missingRules.length + ' 条：' + missingRules[0]) : (cssRules.length + ' 条规则全部命中'))
check('CSS 落地设计令牌与几何（几何变量 / 19px KPI 数值 / fixed 提示 / color-mix 热力档 / 模型色板）',
  /--duc-heat-cell:10px;--duc-heat-gap:3px;--duc-heat-gutter:16px;--duc-heat-bodygap:5px;/.test(capturedCss)
    && /\.duc-u-heat-weekdays\{width:var\(--duc-heat-gutter,16px\)/.test(capturedCss)
    // 星期栏与格子列用同一套「10px 子项 + 3px gap」的竖向节奏，因此 一/三/五 与第 0/2/4 行天然同高
    && /\.duc-u-heat-weekdays span\{height:var\(--duc-heat-cell,10px\);line-height:var\(--duc-heat-cell,10px\);\}/.test(capturedCss)
    && /\.duc-u-heat-col\{display:flex;flex-direction:column;gap:var\(--duc-heat-gap,3px\);\}/.test(capturedCss)
    && /\.duc-u-tip\{position:fixed/.test(capturedCss)
    && /\.duc-u-tile-value\{font-size:19px;font-weight:700/.test(capturedCss)
    && /\.duc-u-tile-value\.duc-u-txt\{font-size:15px;font-weight:600;\}/.test(capturedCss)
    && /\.duc-u-card\{background:var\(--dsw-alias-bg-layer-1\);border:1px solid var\(--dsw-alias-border-l1\);border-radius:12px;padding:12px 14px;/.test(capturedCss)
    && /color-mix\(in srgb,var\(--duc-heat-hue\) 12%,transparent\)/.test(capturedCss)
    && /--duc-m1:#4f8cff/.test(capturedCss)
    && !/--duc-h0/.test(capturedCss),
  capturedCss.length + ' 字符')
const cells = findByClass(tree, 'duc-u-heat-cell').filter((n) => n.props.onMouseEnter)
check('每日视图渲染出可交互格子', cells.length > 0, 'cells=' + cells.length)
check('卡片摘要只统计窗口内（120 天前的窗口外数据不计入）',
  all.includes('共 ' + expectRequests.toLocaleString() + ' 次调用 · ' + fmtTokens(expectTokens) + ' tokens'),
  '窗口内合计 ' + fmtTokens(expectTokens) + ' / ' + expectRequests + ' 次')

// ---------- 窗口语义（每日视图）：连续 90 天 + 缺失补零 ----------
const colNodes = findByClass(tree, 'duc-u-heat-col').filter((n) => n.props.className === 'duc-u-heat-col')
const gridCells = findByClass(tree, 'duc-u-heat-cell')
const padCells = findByClass(tree, 'duc-u-heat-pad').filter((n) => n.props.className === 'duc-u-heat-pad')
const slotsInGrid = []
colNodes.forEach((col, c) => {
  (col.children || []).forEach((cell, r) => {
    if (cell && cell.host === 'i' && cell.props && typeof cell.props.onMouseEnter === 'function') slotsInGrid.push({ c: c, r: r, node: cell })
  })
})
check('每日视图为 13–14 列 × 7 行的网格',
  colNodes.length >= 13 && colNodes.length <= 14 && colNodes.every((col) => (col.children || []).length === 7),
  colNodes.length + ' 列 × 7 行')
// 占位格必须与数据格分离：用独立类名，因此既不会继承 level 0 的底色，
// 也不会命中 .duc-u-heat-cell:hover 的描边规则。
check('窗口外的对齐占位格与数据格分离、不可交互（7×列数 − 90）',
  gridCells.length === WINDOW_DAYS && slotsInGrid.length === WINDOW_DAYS
    && padCells.length === colNodes.length * 7 - WINDOW_DAYS
    && padCells.every((n) => typeof n.props.onMouseEnter !== 'function' && n.props['data-l'] === undefined)
    && padCells.every((n) => !String(n.props.className).includes('duc-u-heat-cell')),
  '数据格 ' + gridCells.length + ' / 占位格 ' + padCells.length + ' / 每列 ' + colNodes.length + ' 行')

// 逐格悬浮把日期读回来（走真实的悬浮提示链路），核对窗口逐日连续、无跳格
const seen = []
for (const slot of slotsInGrid) {
  slot.node.props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => rectOf(1, 1) } })
  tree = await renderTree(() => slotRender())
  const tipNode = findByClass(tree, 'duc-u-tip')[0]
  seen.push({ date: tipNode ? texts(tipNode)[0] : null, level: slot.node.props['data-l'], text: tipNode ? texts(tipNode).join(' | ') : '' })
}
const maxDayKey = expectWindow[windowTotals.indexOf(windowMax)]
check('每日视图为连续 90 天窗口，逐日无跳格',
  seen.length === WINDOW_DAYS && seen.every((s, i) => s.date === expectWindow[i]),
  '首格 ' + seen[0].date + ' … 末格 ' + seen[seen.length - 1].date)
check('今天位于窗口最后一格',
  seen[seen.length - 1].date === keyOfDate(todayDate)
    && slotsInGrid[slotsInGrid.length - 1].r === ((todayDate.getDay() + 6) % 7)
    && slotsInGrid[slotsInGrid.length - 1].c === colNodes.length - 1,
  '今天 ' + seen[seen.length - 1].date + ' 在第 ' + (slotsInGrid[slotsInGrid.length - 1].r + 1) + ' 行（周一=1）')
check('行序固定为周一→周日并与真实星期对齐',
  slotsInGrid.every((slot, i) => slot.r === ((parseKey(expectWindow[i]).getDay() + 6) % 7)),
  '窗口首日 ' + expectWindow[0] + ' 落在第 ' + (slotsInGrid[0].r + 1) + ' 行')
check('窗口内缺失日期补零为 level 0（不再被跳过）',
  missingInWindow === WINDOW_DAYS - 30
    && seen.every((s, i) => (byDate.has(expectWindow[i]) ? true : s.level === '0' && s.text.includes('0 tokens'))),
  dailyAll.length + ' 天数据之外补零 ' + missingInWindow + ' 天')
check('有数据的日期按窗口内最大值分档（窗口外数据不参与基准）',
  seen.every((s, i) => s.level === expectLevel(windowTotals[i])) && seen[expectWindow.indexOf(maxDayKey)].level === '4',
  '窗口内基准 max=' + windowMax + '，档位分布 ' + JSON.stringify(seen.reduce((acc, s) => { acc[s.level] = (acc[s.level] || 0) + 1; return acc }, {})))

// 点击「补零」日期（窗口首日，dailyAll 中不存在）：联动仍按日期 key 工作
slotsInGrid[0].node.props.onClick()
tree = await renderTree(() => slotRender())
all = texts(tree).join(' | ')
const emptyCall = requestedCalls.filter((c) => c.route.includes('get-day-records')).pop()
check('点击补零日期按日期 key 拉取该日明细',
  emptyCall && emptyCall.body.date === expectWindow[0]
    && all.includes(expectWindow[0] + ' 当日明细') && all.includes('该日没有模型调用记录'),
  '请求 date=' + (emptyCall && emptyCall.body.date))

// 模拟点击某天
const target = cells[cells.length - 1]
target.props.onClick()
tree = await renderTree(() => slotRender())
all = texts(tree).join(' | ')
check('点击某天后展开当日明细', all.includes(clickedDate + ' 当日明细') && all.includes('✕ 清除'), '')
check('点击某天触发该日明细请求', requestedRoutes.some((r) => r.includes('get-day-records')), '已请求 ' + requestedRoutes.length + ' 次')

// 概览 → 明细：用当日明细里的跳转入口切分区，选中日期跨分区保留
const clickTab = (label) => {
  const btn = findByClass(tree, 'duc-u-tabs').flatMap((n) => [].concat(n.props.children || []))
    .find((n) => n && typeof n.props.onClick === 'function' && [].concat(n.props.children).join('') === label)
  if (btn) btn.props.onClick()
}
const openRecords = findByText(tree, '查看该日调用').find((n) => typeof n.props.onClick === 'function')
if (openRecords) openRecords.props.onClick()
tree = await renderTree(() => slotRender())
all = texts(tree).join(' | ')
check('「查看该日调用」跳转到明细分区', all.includes('调用明细') && all.includes('该日 2 条'), all.slice(0, 60))
check('该日两条记录都渲染出来', all.includes('aaaa1111') && all.includes('bbbb2222'), '')

// 回到概览，再点同一天 → 取消选中
clickTab('概览')
tree = await renderTree(() => slotRender())

// 再点一次同一天 → 取消选中（开关行为与修改前一致）
const selectedCell = findByClass(tree, 'duc-u-heat-cell').find((n) => n.props.onClick && String(n.props.className).includes('duc-u-heat-sel'))
if (selectedCell) selectedCell.props.onClick()
tree = await renderTree(() => slotRender())
all = texts(tree).join(' | ')
check('再次点击同一天取消选中',
  !all.includes(clickedDate + ' 当日明细') && !all.includes('✕ 清除') && !all.includes('该日 2 条') && all.includes('点击某天查看当日明细'),
  '选中格=' + (selectedCell ? selectedCell.props.className : 'none'))

// 模拟悬浮：坐标来自 getBoundingClientRect（.duc-u-tip 已是 position:fixed，不被浮层滚动裁剪）
const hoverCell = findByClass(tree, 'duc-u-heat-cell').filter((n) => n.props.onMouseEnter)[0]
hoverCell.props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => rectOf(120, 300) } })
tree = await renderTree(() => slotRender())
const tip = findByClass(tree, 'duc-u-tip')
check('悬浮提示渲染', tip.length === 1, 'tip=' + tip.length)
check('悬浮坐标 = rect.left+width/2 / rect.top−6（position:fixed 的像素定位）',
  tip.length === 1 && tip[0].props.style.left === '125px' && tip[0].props.style.top === '294px',
  tip.length === 1 ? ('left=' + tip[0].props.style.left + ' top=' + tip[0].props.style.top) : '无提示节点')

// 切换到每周视图
const weekBtn = findByText(tree, '每周')[0]
if (weekBtn && weekBtn.props.onClick) weekBtn.props.onClick()
tree = await renderTree(() => slotRender())
const bars = findByClass(tree, 'duc-u-week-bar')
check('切换到每周视图渲染柱状', bars.length > 0, 'bars=' + bars.length)

// ---------- 窗口语义（每周视图）：同一窗口、周一为周首、空周同样渲染 ----------
const weekCols = findByClass(tree, 'duc-u-week-col').filter((n) => n.props.className === 'duc-u-week-col')
const expectWeekTitles = expectWeeks.map((key) => {
  let total = 0
  let requests = 0
  for (const day of expectTotals) {
    if (mondayKeyOf(day.date) !== key) continue
    total += day.total
    requests += day.requests
  }
  // 部分周（首周/末周）标签取窗口内的真实起止日，而不是窗口之外的周一/周日
  const windowStart = parseKey(expectWindow[0])
  const windowEnd = parseKey(expectWindow[expectWindow.length - 1])
  const monday = parseKey(key)
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  const from = monday.getTime() < windowStart.getTime() ? windowStart : monday
  const to = sunday.getTime() > windowEnd.getTime() ? windowEnd : sunday
  const label = (d) => (d.getMonth() + 1) + '/' + d.getDate()
  return label(from) + '–' + label(to) + '：' + fmtTokens(total) + ' tokens · ' + requests + ' 次请求'
})
const emptyWeeks = expectWeeks.filter((key) => !expectTotals.some((d) => mondayKeyOf(d.date) === key)).length
check('每周视图柱数与每日视图列数一致（同一窗口的周数）',
  bars.length === expectWeeks.length && bars.length === colNodes.length && bars.length >= 13 && bars.length <= 14,
  '柱 ' + bars.length + ' / 期望周数 ' + expectWeeks.length + ' / 每日列数 ' + colNodes.length)
check('每周视图按周一为周首逐日聚合，空周渲染 0 值柱',
  weekCols.length === expectWeekTitles.length && weekCols.every((col, i) => col.props.title === expectWeekTitles[i])
    && weekCols.filter((col) => /：0 tokens · 0 次请求$/.test(String(col.props.title))).length === emptyWeeks && emptyWeeks >= 5,
  '空周 ' + emptyWeeks + ' 根 0 值柱 / 首柱 ' + weekCols[0].props.title)
check('每周视图首柱标签为窗口首日，不显示窗口之前的日期',
  String(weekCols[0].props.title).startsWith(weekLabelOf(expectWindow[0]) + '–'),
  '期望起点 ' + weekLabelOf(expectWindow[0]) + '（窗口之前的周一为 ' + weekLabelOf(mondayKeyOf(expectWindow[0])) + '）· 实际 ' + weekCols[0].props.title)

// 切换到累计视图（注意：「累计」也出现在指标卡文案里，必须按精确文本取按钮）
const cumBtn = findByText(tree, '累计').find((n) => typeof n.props.onClick === 'function'
  && [].concat(n.props.children).some((c) => c === '累计'))
if (cumBtn && cumBtn.props.onClick) cumBtn.props.onClick()
tree = await renderTree(() => slotRender())
const cumSvg = findByClass(tree, 'duc-u-cum').filter((n) => n.props.className === 'duc-u-cum')
check('切换到累计视图渲染折线', cumSvg.length === 1 && cumSvg[0].props.children.length === 1, 'svg=' + cumSvg.length)

// ---------- 窗口语义（累计视图）：同一窗口逐日累加，末点=窗口内总量 ----------
const polyline = (cumSvg[0].children || []).find((n) => n && n.props && typeof n.props.points === 'string')
const pts = String(polyline.props.points).trim().split(/\s+/)
const cumHint = texts(tree).join(' ').match(new RegExp(expectWindow[0] + ' → ' + expectWindow[WINDOW_DAYS - 1] + '：累计 ([0-9.]+ ?[万亿]?) tokens'))
check('累计视图基于同一窗口逐日累加（90 个点，缺失日按 0）',
  pts.length === WINDOW_DAYS && pts.map((p) => Number(p.split(',')[1])).every((y, i, arr) => i === 0 || y <= arr[i - 1] + 1e-9),
  'pts=' + pts.length)
check('累计末点数值等于窗口内有数据日期的总量',
  cumHint !== null && cumHint[1] === fmtTokens(expectTokens) && pts[pts.length - 1].split(',')[1] === '0.00',
  '折线累计 ' + (cumHint ? cumHint[1] : '未匹配') + ' / 期望 ' + fmtTokens(expectTokens) + '（' + expectTokens + '）')

// ---------- 趋势分区：y 轴中文刻度 / 模型命中率列 / 会话用量排行 ----------
const clickTabBtn = (label) => {
  const btn = findByClass(tree, 'duc-u-tabs').flatMap((n) => [].concat(n.props.children || []))
    .find((n) => n && typeof n.props.onClick === 'function' && [].concat(n.props.children).join('') === label)
  if (btn) btn.props.onClick()
}
const refreshPage = async () => {
  const btn = findByText(tree, '↻').find((n) => typeof n.props.onClick === 'function')
  if (btn) btn.props.onClick()
  tree = await renderTree(() => slotRender())
  all = texts(tree).join(' | ')
}
clickTabBtn('趋势')
tree = await renderTree(() => slotRender())
all = texts(tree).join(' | ')
const yTicks = findByClass(tree, 'duc-u-y').map((n) => texts(n).join(''))
check('消耗趋势 y 轴刻度改用中文数量级（万/亿，无 K/M/B）',
  yTicks.length > 0 && yTicks.some((t) => /^[0-9]+万$/.test(t)) && yTicks.every((t) => !/[KMB]/.test(t)),
  yTicks.join(' / '))
// 模型用量表：按表头顺序与单元格位置逐格核对（趋势分区的第一个表格）
const modelTable = findByClass(tree, 'duc-table')[0]
const headerCells = []
walk(modelTable, (n) => { if (n && n.host === 'th') headerCells.push(texts(n).join('').trim()) })
// 单元格里可能是数字子节点（如请求数），所以这里不能只用 texts()（它只收字符串）
const bodyRowsOf = (table) => {
  const rows = []
  walk(table, (n) => {
    if (!n || n.host !== 'tr') return
    const cells = []
    walk(n, (c) => {
      if (!c || c.host !== 'td') return
      const parts = []
      walk(c, (x) => { if (typeof x === 'string' || typeof x === 'number') parts.push(String(x)) })
      cells.push(parts.join(''))
    })
    if (cells.length) rows.push(cells)
  })
  return rows
}
const modelBody = bodyRowsOf(modelTable)
check('模型用量表新增「命中率」列（表头顺序 + cacheRead/input，input=0 显示 —）',
  headerCells.join(',') === '模型,占比,请求,命中率,输入,输出,缓存命中'
    && modelBody[0][3] === '20.0%' && modelBody[1][3] === '—',
  '表头 ' + headerCells.join(',') + ' · 首行 ' + modelBody[0].join('|') + ' · 次行 ' + modelBody[1].join('|'))
const rankRows = findByClass(tree, 'duc-u-rank-row')
const rankRowText = (row) => texts(row).join(' ').replace(/\s+/g, ' ').trim()
check('会话用量排行卡：只取前 10 条，含排名/标题/日期/Token',
  findByText(tree, '会话用量排行').length === 1 && rankRows.length === 10
    && /^1 会话 1 \d{4}-\d{2}-\d{2} 900 万$/.test(rankRowText(rankRows[0])),
  rankRows.length + ' 行 · 首行 ' + rankRowText(rankRows[0]))
check('会话排行：标题为空显示「未命名会话」，endedAt 为空显示「—」，第 11 条起不渲染',
  /^4 未命名会话 \d{4}-\d{2}-\d{2} /.test(rankRowText(rankRows[3]))
    && /^8 会话 8 — /.test(rankRowText(rankRows[7]))
    && !all.includes('会话 11') && !all.includes('会话 12'),
  rankRowText(rankRows[3]) + ' ｜ ' + rankRowText(rankRows[7]))
check('会话排行卡不渲染「主/子代理」标签（宿主未采集会话深度，禁止臆造）',
  !/主会话|子代理/.test(all) && rankRows.every((row) => !/主会话|子代理/.test(rankRowText(row))),
  '命中「主会话/子代理」= ' + /主会话|子代理/.test(all))
// sessions 为空 → 整卡不渲染
activePayload = Object.assign({}, activePayload, {
  version: (activePayload.version || 0) + 1,
  stats: Object.assign({}, activePayload.stats, { sessions: [] }),
})
await refreshPage()
check('sessions 为空时会话排行整卡不渲染', !all.includes('会话用量排行') && !findByClass(tree, 'duc-u-rank-row').length, '')

// ---------- 中文数量级格式（§9.6 规则表）----------
const setTotal = async (value) => {
  activePayload = Object.assign({}, activePayload, {
    version: (activePayload.version || 0) + 1,
    stats: Object.assign({}, activePayload.stats, {
      totals: Object.assign({}, activePayload.stats.totals, { total: value }),
    }),
  })
  await refreshPage()
}
clickTabBtn('概览')
tree = await renderTree(() => slotRender())
await setTotal(39063000)
const tileTextAfter = () => findByClass(tree, 'duc-u-tile').filter((n) => n.props.className === 'duc-u-tile').map((t) => texts(t).join(' '))
check('数值格式：39,063,000 → 3906.3 万（且全页不再出现 K/M/B 数量级）',
  tileTextAfter().some((t) => t.includes('3906.3 万')) && !/\d(\.\d+)?[KMB](?![A-Za-z])/.test(all),
  tileTextAfter()[0] || '')
await setTotal(120000000)
check('数值格式：120,000,000 → 1.2 亿',
  tileTextAfter().some((t) => t.includes('1.2 亿')),
  tileTextAfter()[0] || '')

// ---------- 时钟漂移加固：宿主给出的日期晚于浏览器今天 ----------
// 宿主按自己的时钟分桶 date key；两端相差一天时，若窗口末端仍硬取浏览器时钟，
// 宿主最新一天会落在窗口之外而不可见。这里让 payload 多出「浏览器明天」的数据，
// 触发重新取数后，该日期必须出现在窗口最后一格且可交互。
const futureKey = keyOfDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1))
activePayload = Object.assign({}, payload, {
  version: payload.version + 1,
  stats: Object.assign({}, stats, {
    dailyAll: stats.dailyAll.concat([{ date: futureKey, requests: 5, prompt: 500, completion: 100, cache_read: 200, total: 800, tools: 1, turns: 1, steps: 2 }]),
  }),
})
const dayBtn = findByText(tree, '每日').find((n) => typeof n.props.onClick === 'function'
  && [].concat(n.props.children).some((c) => c === '每日'))
if (dayBtn) dayBtn.props.onClick()
tree = await renderTree(() => slotRender())
const refreshBtn = findByText(tree, '↻').find((n) => typeof n.props.onClick === 'function')
if (refreshBtn) refreshBtn.props.onClick()
tree = await renderTree(() => slotRender())
const futureSlots = []
const futureCols = findByClass(tree, 'duc-u-heat-col').filter((n) => n.props.className === 'duc-u-heat-col')
futureCols.forEach((col) => {
  (col.children || []).forEach((cell) => {
    if (cell && cell.host === 'i' && cell.props && typeof cell.props.onMouseEnter === 'function') futureSlots.push(cell)
  })
})
const lastSlot = futureSlots[futureSlots.length - 1]
let lastTipDate = null
if (lastSlot) {
  lastSlot.props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => rectOf(1, 1) } })
  tree = await renderTree(() => slotRender())
  const tipNode = findByClass(tree, 'duc-u-tip')[0]
  lastTipDate = tipNode ? texts(tipNode)[0] : null
}
check('数据日期晚于浏览器今天时，窗口锚定到该日期（当天数据不丢）',
  lastTipDate === futureKey && futureSlots.length === WINDOW_DAYS,
  '末格 ' + lastTipDate + ' / 期望 ' + futureKey + ' / 窗口内 ' + futureSlots.length)

// ---------- 既有能力回归：范围切换仍对所有分区生效 ----------
const rangeBtn = findByText(tree, '30天').find((n) => typeof n.props.onClick === 'function'
  && [].concat(n.props.children).some((c) => c === '30天'))
if (rangeBtn) rangeBtn.props.onClick()
tree = await renderTree(() => slotRender())
const rangeCall = requestedCalls.filter((c) => c.route.includes('get-usage')).pop()
check('范围切换（30天）仍触发全页取数，热力图窗口不受影响',
  !!rangeCall && rangeCall.body.range === '30d' && findByClass(tree, 'duc-u-heat-col').filter((n) => n.props.className === 'duc-u-heat-col').length >= 13,
  '最后一次 get-usage range=' + (rangeCall && rangeCall.body.range))

let failed = 0
for (const c of checks) {
  console.log((c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '  → ' + c.detail : ''))
  if (!c.ok) failed += 1
}
console.log(failed === 0 ? '\n客户端渲染全部通过 (' + checks.length + ' 项)' : '\n失败 ' + failed + ' 项')
process.exit(failed === 0 ? 0 : 1)
