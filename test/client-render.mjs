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
  useEffect(fn) {
    const inst = current
    const i = inst.h++
    if (!(i in inst.hooks)) { inst.hooks[i] = true; fn() }
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

// ---------- 沙箱加载真实 bundle ----------
let captured = null
const sandbox = {
  window: { __ModuleLoader__: { load: (mod) => { captured = mod } } },
  document: { createElement: () => ({ textContent: '', remove() {} }), head: { appendChild() {} } },
  fetch: async () => ({ ok: true, status: 200, json: async () => payload }),
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
check('指标卡：累计 Token', all.includes('累计 Token'), '')
check('指标卡：单会话峰值', all.includes('单会话峰值') && all.includes('大会话'), '')
check('指标卡：最长聊天时长', all.includes('最长聊天时长') && all.includes('2h'), '')
check('指标卡：连续天数', all.includes('连续天数') && all.includes('最长 5 天'), '')
check('热力图三视图按钮', all.includes('每日') && all.includes('每周') && all.includes('累计'), '')
const cells = findByClass(tree, 'duc-u-heat-cell').filter((n) => n.props.onMouseEnter)
check('每日视图渲染出可交互格子', cells.length > 0, 'cells=' + cells.length)

// 模拟点击某天
const target = cells[cells.length - 1]
target.props.onClick()
tree = await renderTree(() => slotRender())
all = texts(tree).join(' | ')
check('点击某天后展开当日明细', all.includes('当日明细'), '')
check('点击某天后调用明细进入筛选态', all.includes('在最近 50 条内筛选'), '')

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

// 切换到累计视图（注意：「累计」也出现在指标卡文案里，必须按精确文本取按钮）
const cumBtn = findByText(tree, '累计').find((n) => typeof n.props.onClick === 'function'
  && [].concat(n.props.children).some((c) => c === '累计'))
if (cumBtn && cumBtn.props.onClick) cumBtn.props.onClick()
tree = await renderTree(() => slotRender())
const cumSvg = findByClass(tree, 'duc-u-cum').filter((n) => n.props.className === 'duc-u-cum')
check('切换到累计视图渲染折线', cumSvg.length === 1 && cumSvg[0].props.children.length === 1, 'svg=' + cumSvg.length)

let failed = 0
for (const c of checks) {
  console.log((c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '  → ' + c.detail : ''))
  if (!c.ok) failed += 1
}
console.log(failed === 0 ? '\n客户端渲染全部通过 (' + checks.length + ' 项)' : '\n失败 ' + failed + ' 项')
process.exit(failed === 0 ? 0 : 1)
