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
const stats = {
  totals: { total: 1234567, prompt: 900000, completion: 334567, cache_read: 500000, requests: 42, turns: 10, steps: 20, tools: 30 },
  prevTotals: { total: 1000000, requests: 40 },
  daily,
  dailyAll,
  dailyModels: { [daily[daily.length - 2].date]: [{ model: 'gpt-6-sol', tokens: 12000, requests: 4 }] },
  models: [{ model: 'gpt-6-sol', requests: 10, input: 100, output: 50, cacheRead: 20, total: 170 }],
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
const sandbox = {
  window: { __ModuleLoader__: { load: (mod) => { captured = mod } } },
  document: { createElement: () => ({ textContent: '', remove() {} }), head: { appendChild() {} } },
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
const fmtTokens = (value) => {
  const n = Number(value) || 0
  if (n >= 1000000000) return (n / 1000000000).toFixed(2) + 'B'
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(Math.round(n))
}
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
// 指标条：原先重复的「总消耗 / 累计 Token」已合并，主指标 4 张 + 次要指标一行
const primaryTiles = findByClass(tree, 'duc-u-tile').filter((n) => n.props.className === 'duc-u-tile')
check('主指标为 4 张瓦片（重复的累计 Token 已与总消耗合并）',
  primaryTiles.length === 4 && all.includes('总消耗') && !all.includes('累计 Token'),
  '瓦片 ' + primaryTiles.length + ' 张')
const chips = findByClass(tree, 'duc-u-chip')
check('次要指标：单会话峰值与最长聊天在同一行',
  chips.some((c) => texts(c).join('').includes('单会话峰值'))
    && chips.some((c) => texts(c).join('').includes('最长聊天') && texts(c).join('').includes('2h')),
  'chips=' + chips.length)
check('指标卡：连续天数', all.includes('连续天数') && all.includes('最长 5 天'), '')
check('热力图三视图按钮', all.includes('每日') && all.includes('每周') && all.includes('累计'), '')
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
  slot.node.props.onMouseEnter({ currentTarget: { offsetLeft: 1, offsetTop: 1 } })
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

// 模拟悬浮
const hoverCell = findByClass(tree, 'duc-u-heat-cell').filter((n) => n.props.onMouseEnter)[0]
hoverCell.props.onMouseEnter({ currentTarget: { offsetLeft: 42, offsetTop: 7 } })
tree = await renderTree(() => slotRender())
const tip = findByClass(tree, 'duc-u-tip')
check('悬浮提示渲染', tip.length === 1, 'tip=' + tip.length)

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
const cumHint = texts(tree).join(' ').match(new RegExp(expectWindow[0] + ' → ' + expectWindow[WINDOW_DAYS - 1] + '：累计 ([0-9.]+[BKM]?) tokens'))
check('累计视图基于同一窗口逐日累加（90 个点，缺失日按 0）',
  pts.length === WINDOW_DAYS && pts.map((p) => Number(p.split(',')[1])).every((y, i, arr) => i === 0 || y <= arr[i - 1] + 1e-9),
  'pts=' + pts.length)
check('累计末点数值等于窗口内有数据日期的总量',
  cumHint !== null && cumHint[1] === fmtTokens(expectTokens) && pts[pts.length - 1].split(',')[1] === '0.00',
  '折线累计 ' + (cumHint ? cumHint[1] : '未匹配') + ' / 期望 ' + fmtTokens(expectTokens) + '（' + expectTokens + '）')

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
  lastSlot.props.onMouseEnter({ currentTarget: { offsetLeft: 1, offsetTop: 1 } })
  tree = await renderTree(() => slotRender())
  const tipNode = findByClass(tree, 'duc-u-tip')[0]
  lastTipDate = tipNode ? texts(tipNode)[0] : null
}
check('数据日期晚于浏览器今天时，窗口锚定到该日期（当天数据不丢）',
  lastTipDate === futureKey && futureSlots.length === WINDOW_DAYS,
  '末格 ' + lastTipDate + ' / 期望 ' + futureKey + ' / 窗口内 ' + futureSlots.length)

let failed = 0
for (const c of checks) {
  console.log((c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '  → ' + c.detail : ''))
  if (!c.ok) failed += 1
}
console.log(failed === 0 ? '\n客户端渲染全部通过 (' + checks.length + ' 项)' : '\n失败 ' + failed + ' 项')
process.exit(failed === 0 ? 0 : 1)
