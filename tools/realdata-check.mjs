// 用本机真实会话日志驱动 dsh-usage-codex 宿主端，验证数据管道（npm run check:real）。
// 只读取 $DSH_HOME/sessions 下的日志并在内存里聚合：不联网、不写任何文件。
// 与 npm test 的区别：test 用合成事件，这里用的是真实日志与真实事件形状。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { apply } from '../lib/index.js'

const ZSTD_MAGIC = 0xfd2fb528
function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return frames
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return frames
    offset += 4
    if (offset >= buffer.length) return frames
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) return frames
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remaining = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remaining) return frames
    offset += remaining
    for (;;) {
      if (buffer.length - offset < 3) return frames
      const header = buffer.readUIntLE(offset, 3)
      offset += 3
      const last = (header & 1) !== 0
      const type = (header >>> 1) & 3
      const size = header >>> 3
      if (type === 3) return frames
      const payload = type === 1 ? 1 : size
      if (buffer.length - offset < payload) return frames
      offset += payload
      if (last) break
    }
    if (checksum) { if (buffer.length - offset < 4) return frames; offset += 4 }
    frames.push({ start, end: offset })
  }
  return frames
}

function readEvents(file) {
  const buf = readFileSync(file)
  const events = []
  for (const frame of scanZstdFrames(buf)) {
    let text
    try { text = zstdDecompressSync(buf.subarray(frame.start, frame.end)).toString('utf8') } catch { continue }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try { events.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  }
  return events
}

const dshHome = process.env.DSH_HOME || join(process.env.HOME, '.dsh')
const root = join(dshHome, 'sessions')
const sessions = []
for (const workspace of readdirSync(root)) {
  const wsDir = join(root, workspace)
  let dirs
  try { dirs = readdirSync(wsDir) } catch { continue }
  for (const dir of dirs) {
    const dirPath = join(wsDir, dir)
    let names
    try { names = readdirSync(dirPath) } catch { continue }
    const log = names.find((n) => n.endsWith('.jsonl.zstd'))
    if (!log) continue
    const events = readEvents(join(dirPath, log))
    if (!events.length) continue
    const header = events.find((e) => e.type === 'session')
    const id = (header && header.id) || dir
    sessions.push({ id, events, header: { id, meta: { cwd: (header && header.cwd) || '' } } })
  }
}

console.log('读入真实会话:', sessions.length, '个 · 事件总数:', sessions.reduce((n, s) => n + s.events.length, 0))

const routes = new Map()
const ctx = {
  get(name) {
    if (name === 'sessionQuery') {
      return {
        async listSessions() { return sessions.map((s) => ({ header: s.header })) },
        async readSession(id) { const s = sessions.find((x) => x.id === id); return { events: s ? s.events : [] } },
      }
    }
    return undefined
  },
  webServer: { register(route) { routes.set(route.path, route.handler) } },
  on() {},
  effect() { return () => {} },
  logger: { info() {}, warn() {}, error() {} },
}

const started = Date.now()
apply(ctx)
await new Promise((resolve) => setTimeout(resolve, 1200))
console.log('扫描耗时:', Date.now() - started, 'ms')

function callRoute(path, args) {
  return new Promise((resolve) => {
    const handler = routes.get(path)
    if (!handler) return resolve({ error: '未注册: ' + path })
    const req = { async *[Symbol.asyncIterator]() { yield JSON.stringify(args || {}) } }
    handler(req, { writeHead() {}, end(body) { resolve(JSON.parse(body)) } })
  })
}

const usage = await callRoute('/dsh-usage-codex/api/get-usage', { range: 'all' })
const stats = usage.stats
const fmt = (n) => Number(n || 0).toLocaleString('en-US')

console.log('\n=== 真实聚合结果 ===')
console.log('就绪:', usage.ready, '| 范围:', usage.range, '| 错误:', usage.error || '无')
console.log('累计 Token:', fmt(stats.totals.total), '| 请求:', stats.totals.requests, '| 轮:', stats.totals.turns, '| 步:', stats.totals.steps)
console.log('缓存读:', fmt(stats.totals.cache_read), '| 缓存命中率:', stats.totals.prompt > 0 ? (stats.totals.cache_read / stats.totals.prompt * 100).toFixed(1) + '%' : '—')
console.log('全量天数 dailyAll:', stats.dailyAll.length, '| 有用量天数:', stats.dailyAll.filter((d) => d.total > 0).length)
console.log('单会话峰值:', stats.sessionPeak ? fmt(stats.sessionPeak.tokens) + ' tokens · ' + (stats.sessionPeak.title || '未命名') : '无')
console.log('最长聊天时长:', stats.longestChat ? (stats.longestChat.durationMs / 60000).toFixed(1) + ' 分钟 · ' + (stats.longestChat.title || '未命名') : '无')
console.log('连续天数: 当前', stats.streaks.current, '· 最长', stats.streaks.longest)
console.log('会话条目:', stats.sessions.length, '| dailyModels 覆盖天数:', Object.keys(stats.dailyModels).length)
console.log('\n按模型（前 6）:')
for (const m of stats.models.slice(0, 6)) {
  console.log('  ' + m.model.padEnd(28) + fmt(m.total).padStart(12) + ' tokens · ' + m.requests + ' 次请求' + (m.cacheRead ? ' · 缓存 ' + fmt(m.cacheRead) : ''))
}
const providers = [...new Set(stats.models.map((m) => m.model))]
console.log('\n涉及模型数:', providers.length)

const anyDay = stats.dailyAll.filter((d) => d.total > 0).slice(-1)[0]
if (anyDay) {
  const dayOut = await callRoute('/dsh-usage-codex/api/get-day-records', { date: anyDay.date })
  console.log('该日明细路由 (' + anyDay.date + '):', Array.isArray(dayOut.records) ? dayOut.records.length + ' 条' : dayOut.error)
  console.log('  样例:', JSON.stringify((dayOut.records || [])[0] || null))
}
