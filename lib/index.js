// dsh-usage-codex —— Host 半端（静态 cordis 插件形态）
// 衍生自 yxxbc/dsh-balance-plugin（MIT），仅保留用量统计模块。
// 用 ctx.webServer 提供 HTTP 路由（POST /dsh-usage-codex/api/<name>），Client 用 fetch 调用。

export const inject = ['webServer']

export function apply(ctx) {
  const webServer = ctx.webServer
  const sessionQuery = ctx.get('sessionQuery')

  // ===== 用量统计 =====
  const USAGE_KEEP_MS = 90 * 86400000
  /** 每个自然日最多保留多少条调用明细，以及天桶保留多少天。 */
  const DAY_RECORDS_MAX = 60
  const DAY_RECORDS_KEEP_DAYS = 95
  const usage = {
    ready: false,
    error: null,
    version: 0,
    perDay: new Map(),
    perModel: new Map(),
    // sessionId -> { tokens, requests, first, last, title }（Codex 指标卡：
    // 单会话峰值 Token、最长聊天时长都要按会话聚合，原有的按天结构给不出来）
    perSession: new Map(),
    records: [],
    // date -> 该日调用明细（热力图点选历史某天时用；全局 records 只有最近 50 条）
    perDayRecords: new Map(),
    live: {
      turns: 0,
      steps: 0,
      llmMs: 0,
      toolMs: 0,
      toolCalls: 0,
      firstTokenSum: 0,
      firstTokenCount: 0,
      outputTokens: 0,
      stepStart: new Map(),
      stepToolAccum: new Map(),
      toolStart: new Map(),
      firstChunk: new Map(),
    },
  }
  const liveSeqs = new Map()

  function dayKeyOf(time) {
    const d = new Date(time)
    const pad = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }

  function emptyAgg() {
    return { requests: 0, input: 0, output: 0, cacheRead: 0, tools: 0, turns: 0, steps: 0, total: 0 }
  }

  function mergeAgg(target, source) {
    target.requests += source.requests || 0
    target.input += source.input || 0
    target.output += source.output || 0
    target.cacheRead += source.cacheRead || 0
    target.tools += source.tools || 0
    target.turns += source.turns || 0
    target.steps += source.steps || 0
    target.total = target.input + target.output
  }

  function bumpUsage() { usage.version += 1 }

  /** 取（或创建）单个会话的累计记录，并推进该会话的首末事件时间。 */
  function sessionStatOf(sessionId, time) {
    let stat = usage.perSession.get(sessionId)
    if (!stat) {
      stat = { tokens: 0, requests: 0, first: null, last: null, title: null }
      usage.perSession.set(sessionId, stat)
    }
    if (typeof time === 'number') {
      if (stat.first === null || time < stat.first) stat.first = time
      if (stat.last === null || time > stat.last) stat.last = time
    }
    return stat
  }

  function ingestEvent(sessionId, event) {
    const time = event.time
    const data = event.data || {}
    const live = usage.live
    const sessionStat = sessionStatOf(sessionId, time)
    if (event.type === 'session/title') {
      const title = data && typeof data.title === 'string' ? data.title.trim() : ''
      if (title) sessionStat.title = title.slice(0, 80)
      return
    }
    if (event.type === 'assistant/message') {
      const usageInfo = data.usage
      if (usageInfo) {
        const model = data.message && data.message.source ? String(data.message.source.model || 'unknown') : 'unknown'
        const day = dayKeyOf(time)
        const agg = {
          requests: 1,
          input: usageInfo.inputTokens || 0,
          output: usageInfo.outputTokens || 0,
          cacheRead: usageInfo.cacheReadTokens || 0,
          tools: 0,
          turns: 0,
          steps: 0,
        }
        const dayAgg = usage.perDay.get(day) || emptyAgg()
        mergeAgg(dayAgg, agg)
        usage.perDay.set(day, dayAgg)
        let modelMap = usage.perModel.get(model)
        if (!modelMap) { modelMap = new Map(); usage.perModel.set(model, modelMap) }
        const modelAgg = modelMap.get(day) || emptyAgg()
        mergeAgg(modelAgg, agg)
        modelMap.set(day, modelAgg)
        live.outputTokens += usageInfo.outputTokens || 0
        sessionStat.tokens += agg.input + agg.output + agg.cacheRead
        sessionStat.requests += 1
        // 会话 id 形如 `session-23e87159-…`：先去掉 `session-` 前缀再截断，
        // 否则 8 位会被固定前缀占满，明细里每一行都显示成 "session-"。
        const shortSessionId = String(sessionId).replace(/^session-/, '').slice(0, 8)
        const record = { time: time, sessionId: shortSessionId, model: model, input: agg.input + agg.cacheRead, output: agg.output, cacheRead: agg.cacheRead }
        usage.records.unshift(record)
        if (usage.records.length > 50) usage.records.length = 50
        // 按天留一份明细：热力图点选历史某天时，「调用明细」才有内容可显示。
        // 全局 records 只保留最近 50 条，直接按日期过滤在较早的日子上必然是空的。
        let dayRecords = usage.perDayRecords.get(day)
        if (!dayRecords) { dayRecords = []; usage.perDayRecords.set(day, dayRecords) }
        dayRecords.unshift(record)
        if (dayRecords.length > DAY_RECORDS_MAX) dayRecords.length = DAY_RECORDS_MAX
        // 天桶本身也要随保留窗口过期，否则长期运行会一直堆积。
        if (usage.perDayRecords.size > DAY_RECORDS_KEEP_DAYS) {
          const oldest = [...usage.perDayRecords.keys()].sort()
          for (const stale of oldest.slice(0, usage.perDayRecords.size - DAY_RECORDS_KEEP_DAYS)) usage.perDayRecords.delete(stale)
        }
        bumpUsage()
      }
      return
    }
    if (event.type === 'turn/end') {
      const day = dayKeyOf(time)
      const dayAgg = usage.perDay.get(day) || emptyAgg()
      dayAgg.turns += 1
      usage.perDay.set(day, dayAgg)
      live.turns += 1
      bumpUsage()
      return
    }
    if (event.type === 'step/start') {
      live.stepStart.set(sessionId + ':' + data.turn + ':' + data.step, time)
      return
    }
    if (event.type === 'step/end') {
      const key = sessionId + ':' + data.turn + ':' + data.step
      const start = live.stepStart.get(key)
      const toolAccum = live.stepToolAccum.get(key) || 0
      if (typeof start === 'number') live.llmMs += Math.max(0, time - start - toolAccum)
      live.stepStart.delete(key)
      live.stepToolAccum.delete(key)
      const day = dayKeyOf(time)
      const dayAgg = usage.perDay.get(day) || emptyAgg()
      dayAgg.steps += 1
      usage.perDay.set(day, dayAgg)
      live.steps += 1
      bumpUsage()
      return
    }
    if (event.type === 'tool/call') {
      live.toolStart.set(String(data.callId), time)
      return
    }
    if (event.type === 'tool/result') {
      const callId = data.message && data.message.source ? String(data.message.source.callId || '') : ''
      const start = live.toolStart.get(callId)
      if (typeof start === 'number') {
        const duration = Math.max(0, time - start)
        live.toolMs += duration
        live.toolCalls += 1
        const stepKey = sessionId + ':' + data.turn + ':' + data.step
        live.stepToolAccum.set(stepKey, (live.stepToolAccum.get(stepKey) || 0) + duration)
      }
      if (callId) live.toolStart.delete(callId)
      const day = dayKeyOf(time)
      const dayAgg = usage.perDay.get(day) || emptyAgg()
      dayAgg.tools += 1
      usage.perDay.set(day, dayAgg)
      bumpUsage()
      return
    }
    if (event.type === 'assistant/chunk') {
      const key = sessionId + ':' + data.turn + ':' + data.step
      if (!live.firstChunk.has(key)) {
        live.firstChunk.set(key, time)
        const start = live.stepStart.get(key)
        if (typeof start === 'number') {
          live.firstTokenSum += Math.max(0, time - start)
          live.firstTokenCount += 1
        }
      }
      return
    }
  }

  ctx.on('session/event', (session, event) => {
    if (!session || !event || typeof event.time !== 'number') return
    const id = String(session.id || '')
    if (!id) return
    const prev = liveSeqs.get(id) || 0
    if (typeof event.seq === 'number' && event.seq > prev) liveSeqs.set(id, event.seq)
    if (event.time >= Date.now() - USAGE_KEEP_MS) ingestEvent(id, event)
  })

  async function scanHistory() {
    if (!sessionQuery) {
      usage.ready = true
      bumpUsage()
      return
    }
    try {
      const sessions = await sessionQuery.listSessions()
      const cut = Date.now() - USAGE_KEEP_MS
      let scanned = 0
      for (const record of sessions) {
        if (!record || !record.header) continue
        const id = String(record.header.id || '')
        if (!id) continue
        try {
          const snapshot = await sessionQuery.readSession(id)
          const events = snapshot && Array.isArray(snapshot.events) ? snapshot.events : []
          const maxSeq = liveSeqs.get(id) || 0
          for (const event of events) {
            if (!event || typeof event.time !== 'number' || event.time < cut) continue
            if (typeof event.seq === 'number' && event.seq <= maxSeq) continue
            ingestEvent(id, event)
          }
          scanned += 1
        } catch (e) { /* 单会话读取失败则跳过 */ }
        if (scanned >= 60) break
      }
    } catch (e) {
      usage.error = String(e && e.message || e).slice(0, 300)
    }
    usage.ready = true
    bumpUsage()
    console.log('[dsh-usage-codex] 用量统计初始化完成：' + usage.perDay.size + ' 天 · ' + usage.records.length + ' 条明细 · ' + usage.live.turns + ' 轮 / ' + usage.live.steps + ' 步')
  }
  scanHistory()

  /** 'YYYY-MM-DD' 的次日 key。用日历运算而非毫秒加法，避免夏令时误差。 */
  function nextDayKeyOf(key) {
    const parts = String(key).split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1, parts[2] + 1)
    const pad = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }

  /** 连续使用天数：当前连续（今天无用量则从昨天起算）与历史最长（Codex 口径）。 */
  function computeStreaks(days) {
    const active = new Set(days.filter((d) => d.total > 0).map((d) => d.date))
    if (active.size === 0) return { current: 0, longest: 0 }
    let current = 0
    const cursor = new Date()
    if (!active.has(dayKeyOf(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
    while (active.has(dayKeyOf(cursor.getTime()))) {
      current += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    const sorted = [...active].sort()
    let longest = 1
    let run = 1
    for (let i = 1; i < sorted.length; i += 1) {
      run = nextDayKeyOf(sorted[i - 1]) === sorted[i] ? run + 1 : 1
      if (run > longest) longest = run
    }
    return { current: current, longest: Math.max(longest, current) }
  }

  function computeUsage(range) {
    const dayList = []
    for (const [key, agg] of usage.perDay) dayList.push({ date: key, agg: agg })
    dayList.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const totalFor = (list) => {
      const t = emptyAgg()
      for (const d of list) mergeAgg(t, d.agg)
      return t
    }
    let current = dayList
    let previous = []
    if (range === '1d') { current = dayList.slice(-2); previous = dayList.slice(-4, -2) }
    else if (range === '7d') { current = dayList.slice(-7); previous = dayList.slice(-14, -7) }
    else if (range === '30d') { current = dayList.slice(-30); previous = dayList.slice(-60, -30) }
    const totals = totalFor(current)
    const prevTotals = previous.length ? totalFor(previous) : null
    const models = []
    for (const [model, byDay] of usage.perModel) {
      let sum = null
      for (const day of current) {
        const agg = byDay.get(day.date)
        if (agg) { if (!sum) sum = emptyAgg(); mergeAgg(sum, agg) }
      }
      if (sum) models.push({
        model: model,
        requests: sum.requests,
        input: sum.input + sum.cacheRead,
        output: sum.output,
        cacheRead: sum.cacheRead,
        total: sum.input + sum.output + sum.cacheRead,
      })
    }
    models.sort((a, b) => b.total - a.total)
    // 按日 × 模型：热力图点击某天后，用它渲染"当日明细"，无需再次请求。
    const dailyModels = {}
    for (const [model, byDay] of usage.perModel) {
      for (const [date, agg] of byDay) {
        const bucket = dailyModels[date] || (dailyModels[date] = [])
        bucket.push({ model: model, tokens: agg.input + agg.cacheRead + agg.output, requests: agg.requests })
      }
    }
    for (const date of Object.keys(dailyModels)) dailyModels[date].sort((a, b) => b.tokens - a.tokens)
    const dayPayload = (d) => {
      const prompt = d.agg.input + d.agg.cacheRead
      return {
        date: d.date,
        requests: d.agg.requests,
        prompt: prompt,
        completion: d.agg.output,
        cache_read: d.agg.cacheRead,
        total: prompt + d.agg.output,
        tools: d.agg.tools,
        turns: d.agg.turns,
        steps: d.agg.steps,
      }
    }
    const sessionList = []
    for (const [sid, s] of usage.perSession) {
      sessionList.push({
        id: sid,
        title: s.title,
        tokens: s.tokens,
        requests: s.requests,
        startedAt: s.first,
        endedAt: s.last,
        durationMs: s.first !== null && s.last !== null ? Math.max(0, s.last - s.first) : 0,
      })
    }
    sessionList.sort((a, b) => b.tokens - a.tokens)
    const peak = sessionList.length > 0 ? sessionList[0] : null
    const longestChat = sessionList.reduce((best, s) => (best === null || s.durationMs > best.durationMs ? s : best), null)
    const streaks = computeStreaks(dayList.map(dayPayload))
    const live = usage.live
    const totalsPrompt = totals.input + totals.cacheRead
    return {
      totals: {
        total: totalsPrompt + totals.output,
        prompt: totalsPrompt,
        completion: totals.output,
        cache_read: totals.cacheRead,
        requests: totals.requests,
        turns: totals.turns,
        steps: totals.steps,
        tools: totals.tools,
      },
      prevTotals: prevTotals ? { total: prevTotals.input + prevTotals.output + prevTotals.cacheRead, requests: prevTotals.requests } : null,
      daily: current.map(dayPayload),
      // 热力图三视图与连续天数需要完整历史；daily 受所选范围限制，故单独给出全量序列。
      dailyAll: dayList.map(dayPayload),
      dailyModels: dailyModels,
      sessions: sessionList.slice(0, 20),
      sessionPeak: peak ? { tokens: peak.tokens, title: peak.title, date: peak.startedAt ? dayKeyOf(peak.startedAt) : null } : null,
      longestChat: longestChat ? { durationMs: longestChat.durationMs, title: longestChat.title, id: longestChat.id } : null,
      streaks: streaks,
      models: models,
      records: usage.records,
      live: {
        turns: live.turns,
        steps: live.steps,
        llmMs: live.llmMs,
        toolMs: live.toolMs,
        toolCalls: live.toolCalls,
        firstTokenMs: live.firstTokenCount ? live.firstTokenSum / live.firstTokenCount : 0,
        firstTokenCount: live.firstTokenCount,
        tokPerSec: live.llmMs > 0 ? (live.outputTokens / live.llmMs) * 1000 : 0,
      },
    }
  }

  // ===== 私有 RPC：webServer 路由（POST /dsh-usage-codex/api/<name>，JSON in/out）=====
  function registerRoute(name, handler) {
    if (!webServer) return
    webServer.register({
      kind: 'exact',
      path: '/dsh-usage-codex/api/' + name,
      handler: async (req, res) => {
        let body = ''
        try {
          for await (const chunk of req) body += chunk
        } catch (e) { /* 忽略读流错误 */ }
        let args = {}
        try { args = body ? JSON.parse(body) : {} } catch (e) { args = {} }
        let result
        try {
          result = await handler(args)
        } catch (e) {
          result = { error: String(e && e.message || e).slice(0, 500) }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
      },
    })
  }

  registerRoute('get-usage', async (args) => {
    const range = args && typeof args.range === 'string' && ['1d', '7d', '30d', 'all'].indexOf(args.range) !== -1 ? args.range : '7d'
    return {
      version: usage.version,
      ready: usage.ready,
      error: usage.error,
      updatedAt: Date.now(),
      range: range,
      stats: computeUsage(range),
    }
  })

  // 热力图点选某天时单独取该日明细：只回这一天的数据，不随轮询反复传输。
  registerRoute('get-day-records', async (args) => {
    const date = args && typeof args.date === 'string' ? args.date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date 必须是 YYYY-MM-DD' }
    return { date: date, records: usage.perDayRecords.get(date) || [] }
  })

}
