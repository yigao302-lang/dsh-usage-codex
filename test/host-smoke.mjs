// dsh-usage-codex 宿主端无头冒烟测试（npm test 会执行）：
// 用合成会话事件驱动真实插件代码，验证 Codex 指标卡所需的字段都能算出来。
import { readFileSync } from 'node:fs'
import { apply } from '../lib/index.js'

const DAY = 86400000
const now = Date.now()
const routes = new Map()

// 三天，其中今天与昨天有调用，形成 2 天连续；另一段历史连续 2 天（间隔一天）
const dayAt = (offsetDays, hour) => {
  const d = new Date(now - offsetDays * DAY)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

function mkEvents(sessionId, dayOffset, tokens, seqBase, title) {
  const t0 = dayAt(dayOffset, 10)
  const t1 = dayAt(dayOffset, 12)
  return [
    { type: 'session', seq: seqBase, time: t0, id: sessionId, cwd: '/tmp/ws' },
    { type: 'session/title', seq: seqBase + 1, time: t0 + 1000, data: { title: title } },
    { type: 'turn/start', seq: seqBase + 2, time: t0 + 2000, data: { turn: 1 } },
    { type: 'step/start', seq: seqBase + 3, time: t0 + 3000, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', seq: seqBase + 4, time: t0 + 5000, data: { message: { source: { model: 'gpt-6-sol' } }, usage: { inputTokens: tokens, outputTokens: Math.round(tokens / 4), cacheReadTokens: Math.round(tokens / 2), cacheWriteTokens: 0 } } },
    { type: 'tool/call', seq: seqBase + 5, time: t0 + 6000, data: { callId: 'c1', name: 'bash', turn: 1, step: 1 } },
    { type: 'tool/result', seq: seqBase + 6, time: t0 + 9000, data: { turn: 1, step: 1, message: { source: { callId: 'c1' } } } },
    { type: 'step/end', seq: seqBase + 7, time: t1 - 1000, data: { turn: 1, step: 1 } },
    { type: 'turn/end', seq: seqBase + 8, time: t1, data: { turn: 1, reason: { kind: 'stop' } } },
  ]
}

const sessions = [
  { header: { id: 's-big', cwd: '/tmp/ws' }, title: '大会话' },
  { header: { id: 's-small', cwd: '/tmp/ws' }, title: '小会话' },
]

const sessionQuery = {
  async listSessions() { return sessions },
  async readSession(id) {
    if (id === 's-big') return { events: mkEvents('s-big', 0, 5000, 1, '大会话') }
    return { events: mkEvents('s-small', 1, 1000, 1, '小会话') }
  },
}

const ctx = {
  get(name) {
    if (name === 'sessionQuery') return sessionQuery
    if (name === 'credentials') return { get() { return undefined }, set() {}, delete() {} }
    if (name === 'shell') return { openExternal() {} }
    if (name === 'clientModules') return { register() {} }
    if (name === 'tools') return { register() {} }
    return undefined
  },
  webServer: { register(route) { routes.set(route.path, route.handler) } },
  on() {},
  interval() { return () => {} },
  effect() { return () => {} },
  logger: { info() {}, warn() {}, error() {} },
}

apply(ctx)
await new Promise((resolve) => setTimeout(resolve, 400))

const handler = routes.get('/dsh-usage-codex/api/get-usage')
if (!handler) {
  console.error('FAIL: get-usage 路由未注册')
  process.exit(1)
}

let payload = ''
const res = { writeHead() {}, end(body) { payload = body } }
await handler([], res)
const data = JSON.parse(payload)
const stats = data.stats || data

/** 以 POST body 调用某个已注册路由。 */
function callRoute(path, args) {
  const routeHandler = routes.get(path)
  if (!routeHandler) return Promise.resolve({ error: '路由未注册: ' + path })
  return new Promise((resolve) => {
    const req = { async *[Symbol.asyncIterator]() { yield JSON.stringify(args || {}) } }
    const fakeRes = { writeHead() {}, end(body) { resolve(JSON.parse(body)) } }
    routeHandler(req, fakeRes)
  })
}

const pad2 = (n) => String(n).padStart(2, '0')
const today = new Date()
const todayKey = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate())

const checks = []
const check = (name, ok, detail) => { checks.push({ name, ok, detail }) }

check('dailyAll 存在且为全量序列', Array.isArray(stats.dailyAll) && stats.dailyAll.length > 0, 'len=' + (stats.dailyAll || []).length)
check('sessionPeak 取到最大值会话', !!stats.sessionPeak && stats.sessionPeak.tokens === 8750, JSON.stringify(stats.sessionPeak))
check('sessionPeak 带标题', !!stats.sessionPeak && stats.sessionPeak.title === '大会话', stats.sessionPeak && stats.sessionPeak.title)
check('longestChat 有值', !!stats.longestChat && stats.longestChat.durationMs > 0, JSON.stringify(stats.longestChat))
check('streaks 计算正确（今昨 2 天）', !!stats.streaks && stats.streaks.current === 2, JSON.stringify(stats.streaks))
check('dailyModels 按日给出模型明细', !!stats.dailyModels && Object.keys(stats.dailyModels).length > 0, 'days=' + Object.keys(stats.dailyModels || {}).length)
check('daily 仍按范围返回', Array.isArray(stats.daily) && stats.daily.length > 0, 'len=' + (stats.daily || []).length)

// ── 契约检查：客户端真正读取的字段，宿主必须都给得出来 ──
// 字段清单直接从 lib/client.js 源码提取，避免手写清单与代码脱节。
const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const usedStatsKeys = [...new Set([...clientSrc.matchAll(/\bstats\.([A-Za-z_]\w*)/g)].map((m) => m[1]))]
const usedLiveKeys = [...new Set([...clientSrc.matchAll(/\blive\.([A-Za-z_]\w*)/g)].map((m) => m[1]))]
const usedDayKeys = [...new Set([...clientSrc.matchAll(/\bday\.([A-Za-z_]\w*)/g)].map((m) => m[1]))]

const missingStats = usedStatsKeys.filter((k) => !(k in stats))
check('契约：客户端读取的 stats 字段宿主全部提供', missingStats.length === 0,
  missingStats.length ? '缺 ' + missingStats.join(',') : '共 ' + usedStatsKeys.length + ' 个')

const missingLive = usedLiveKeys.filter((k) => !(k in (stats.live || {})))
check('契约：客户端读取的 live 字段宿主全部提供', missingLive.length === 0,
  missingLive.length ? '缺 ' + missingLive.join(',') : '共 ' + usedLiveKeys.length + ' 个')

const sampleDay = (stats.dailyAll || [])[0] || {}
const missingDay = usedDayKeys.filter((k) => !(k in sampleDay))
check('契约：客户端读取的 daily 条目字段宿主全部提供', missingDay.length === 0,
  missingDay.length ? '缺 ' + missingDay.join(',') : '共 ' + usedDayKeys.length + ' 个')

// ── 该日明细路由（热力图点选某天时用） ──
const dayPayload = await callRoute('/dsh-usage-codex/api/get-day-records', { date: todayKey })
check('get-day-records 返回该日明细',
  Array.isArray(dayPayload.records) && dayPayload.records.length === 1,
  'records=' + (Array.isArray(dayPayload.records) ? dayPayload.records.length : dayPayload.error))
const emptyDay = await callRoute('/dsh-usage-codex/api/get-day-records', { date: '2000-01-01' })
check('get-day-records 对无数据日期返回空数组', Array.isArray(emptyDay.records) && emptyDay.records.length === 0, '')
const badDay = await callRoute('/dsh-usage-codex/api/get-day-records', { date: 'not-a-date' })
check('get-day-records 拒绝非法日期', !!badDay.error, badDay.error || '未拒绝')

let failed = 0
for (const c of checks) {
  console.log((c.ok ? 'PASS  ' : 'FAIL  ') + c.name + '  → ' + c.detail)
  if (!c.ok) failed += 1
}
console.log(failed === 0 ? '\n全部通过 (' + checks.length + ' 项)' : '\n失败 ' + failed + ' 项')
process.exit(failed === 0 ? 0 : 1)
