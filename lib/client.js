// dsh-usage-codex —— Client 半端（静态 web 插件形态，ModuleLoader bundle）
// 衍生自 yxxbc/dsh-balance-plugin（MIT），仅保留用量统计。
// RPC 走 fetch POST /dsh-usage-codex/api/<name>。

window.__ModuleLoader__.load({
  id: 'dsh-usage-codex',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    var React = require('react');

    async function apiCall(name, args) {
      const res = await fetch('/dsh-usage-codex/api/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return await res.json()
    }

    function insertStyles(css) {
      try {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
        return () => { try { style.remove() } catch (e) { /* ignore */ } }
      } catch (e) {
        return () => {}
      }
    }

    const inject = ['timer']

    function apply(ctx) {
      insertStyles(`:root{
  --duc-c1:#6b87d9;--duc-c2:#b08427;--duc-c3:#c65f7f;--duc-c4:#8d7ce4;
  --duc-h0:#262a3e;--duc-h1:#303c66;--duc-h2:#42549b;--duc-h3:#5a71c4;--duc-h4:#82a1ea;
}
@media (prefers-color-scheme: light){
  :root{
    --duc-c1:#5d6cc4;--duc-c2:#8f6b1e;--duc-c3:#c2426e;--duc-c4:#6d51c4;
    --duc-h0:#ece4d1;--duc-h1:#cdc7e8;--duc-h2:#a8a0d6;--duc-h3:#837ac0;--duc-h4:#5b4fa0;
  }
}
.duc-ibar{width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none;padding:0;}
.duc-ibar:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);}
.duc-ibar-on{color:var(--dsw-alias-brand-primary);}
.duc-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:24px;}
.duc-overlay-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;width:min(780px,100%);max-height:84vh;display:flex;flex-direction:column;box-shadow:0 14px 44px rgba(0,0,0,.38);}
.duc-overlay-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.duc-overlay-title{font-weight:600;font-size:14px;}
.duc-overlay-body{padding:14px;overflow:auto;}
.duc-btn{border:none;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px;text-decoration:none;font-family:inherit;}
.duc-btn:hover{background:var(--dsw-alias-bg-layer-1);}
.duc-page{font-size:13px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:12px;min-width:0;}
.duc-hint{font-size:11px;color:var(--dsw-alias-label-secondary);}
.duc-table{border-collapse:collapse;width:100%;font-size:12px;}
.duc-table th,.duc-table td{border-bottom:1px solid var(--dsw-alias-border-l1);padding:4px 6px;text-align:left;vertical-align:top;}
.duc-err{color:var(--dsw-alias-state-error-primary);}
.duc-input{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 8px;font-size:13px;font-family:inherit;}
.duc-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary);}
.duc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.duc-u-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.duc-u-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;}
.duc-u-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 12px;font-size:12px;cursor:pointer;font-family:inherit;}
.duc-u-seg button.on{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);}
.duc-u-seg-end{margin-left:auto;}
.duc-u-tabs{display:inline-flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.duc-u-tabs button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 14px;font-size:13px;font-family:inherit;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}
.duc-u-tabs button:hover{color:var(--dsw-alias-label-primary);}
.duc-u-tabs button.on{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom-color:var(--dsw-alias-brand-primary);}
.duc-u-metrics{display:flex;flex-direction:column;gap:8px;}
.duc-u-sub{display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px 12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;}
.duc-u-chip{font-size:11px;color:var(--dsw-alias-label-primary);display:inline-flex;align-items:baseline;gap:6px;min-width:0;}
.duc-u-chip i{font-style:normal;color:var(--dsw-alias-label-secondary);}
.duc-u-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}
.duc-u-tile{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;min-width:0;}
.duc-u-tile-label{font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:6px;}
.duc-u-tile-value{font-size:20px;font-weight:600;line-height:1.2;}
.duc-u-tile-value small{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);margin-left:4px;}
.duc-u-tile-sub{font-size:11px;color:var(--dsw-alias-label-secondary);}
.duc-u-ringwrap{display:flex;align-items:center;gap:12px;}
.duc-u-ring{width:56px;height:56px;border-radius:50%;position:relative;flex:none;}
.duc-u-ring::after{content:'';position:absolute;inset:9px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);}
.duc-u-ring b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;z-index:1;}
.duc-u-live{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.duc-u-heat-wrap{position:relative;padding-top:16px;}
.duc-u-heat-months{position:absolute;top:0;left:0;right:0;height:14px;}
.duc-u-heat-month{position:absolute;top:0;font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.duc-u-heat-body{display:flex;gap:5px;}
.duc-u-heat-weekdays{display:flex;flex-direction:column;gap:3px;font-size:9px;color:var(--dsw-alias-label-secondary);}
.duc-u-heat-weekdays span{height:10px;line-height:10px;}
.duc-u-heat-cols{display:flex;gap:3px;}
.duc-u-heat-col{display:flex;flex-direction:column;gap:3px;}
.duc-u-heat-cell{width:10px;height:10px;border-radius:3px;background:var(--duc-h0);}
.duc-u-heat-cell:hover{outline:1.5px solid var(--dsw-alias-border-l2);outline-offset:1px;}
.duc-u-heat-pad{width:10px;height:10px;border-radius:3px;background:transparent;}
.duc-u-heat-cell[data-l="1"]{background:var(--duc-h1);}
.duc-u-heat-cell[data-l="2"]{background:var(--duc-h2);}
.duc-u-heat-cell[data-l="3"]{background:var(--duc-h3);}
.duc-u-heat-cell[data-l="4"]{background:var(--duc-h4);}
.duc-u-heat-total{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:8px;}
.duc-u-bars-wrap{position:relative;padding-top:22px;}
.duc-u-bars{position:relative;height:200px;display:flex;align-items:flex-end;gap:3px;border-bottom:1px solid var(--dsw-alias-border-l1);padding-left:36px;}
.duc-u-bar-slot{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:200px;}
.duc-u-bar-col{display:flex;flex-direction:column;justify-content:flex-end;width:62%;max-width:38px;min-width:5px;gap:2px;}
.duc-u-bar-col:hover{filter:brightness(1.12);}
.duc-u-bar-col i{display:block;width:100%;min-height:1px;}
.duc-u-bar-col i:last-child{border-radius:3px 3px 0 0;}
.duc-u-s1{background:var(--duc-c1);}
.duc-u-s2{background:var(--duc-c2);}
.duc-u-s3{background:var(--duc-c3);}
.duc-u-gridline{position:absolute;left:36px;right:0;border-top:1px dashed var(--dsw-alias-border-l1);}
.duc-u-y{position:absolute;left:0;transform:translateY(50%);font-size:9px;color:var(--dsw-alias-label-secondary);}
.duc-u-x{display:flex;gap:3px;margin-top:2px;padding-left:36px;}
.duc-u-x span{flex:1;min-width:0;font-size:9px;color:var(--dsw-alias-label-secondary);text-align:left;white-space:nowrap;overflow:hidden;}
.duc-u-empty{padding:14px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px;}
.duc-u-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;}
.duc-u-card-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;}
.duc-u-modelbody{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
.duc-u-donut{width:110px;height:110px;border-radius:50%;position:relative;flex:none;margin:6px auto;}
.duc-u-donut::after{content:'';position:absolute;inset:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);}
.duc-u-donut b{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1;font-size:14px;}
.duc-u-donut b small{font-size:9px;color:var(--dsw-alias-label-secondary);}
.duc-u-num{text-align:right;}
.duc-u-tip{position:absolute;z-index:5;transform:translate(-50%,-100%);margin-top:-6px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 8px;font-size:11px;line-height:1.5;white-space:nowrap;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.18);}
.duc-u-tip b{display:block;font-size:11px;margin-bottom:2px;}
.duc-u-heat-sel{outline:2px solid var(--duc-c1);outline-offset:1px;}
.duc-u-week{display:flex;align-items:flex-end;gap:4px;height:92px;padding-top:6px;overflow-x:auto;}
.duc-u-week-col{flex:1;min-width:16px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px;}
.duc-u-week-bar{width:100%;background:var(--duc-c1);border-radius:3px 3px 0 0;min-height:2px;}
.duc-u-week-x{font-size:9px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.duc-u-cumwrap{display:flex;flex-direction:column;gap:6px;}
.duc-u-cum{width:100%;height:72px;display:block;}
.duc-u-day-sum{font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:6px;}
.duc-u-day-rows{display:flex;flex-direction:column;gap:4px;}
.duc-u-day-row{display:flex;gap:10px;align-items:center;font-size:11px;}
.duc-u-day-model{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`)

      const POLL_MS = 15000

      function useUsageState(range) {
        const pair = React.useState(null)
        const snapshot = pair[0]
        const setSnapshot = pair[1]
        const versionRef = React.useRef(0)
        const idleRef = React.useRef(0)
        React.useEffect(() => {
          let alive = true
          const tick = () => {
            apiCall('get-usage', { range: range }).then((value) => {
              if (!alive || !value || typeof value !== 'object') return
              if (value.version === versionRef.current && idleRef.current < 3) {
                idleRef.current += 1
                return
              }
              versionRef.current = value.version || 0
              idleRef.current = 0
              setSnapshot(value)
            }).catch(() => {})
          }
          tick()
          const disposer = ctx.interval(tick, POLL_MS)
          return () => { alive = false; disposer() }
        }, [range])
        return pair
      }

      /** 点选某天时按需拉取该日调用明细；null 表示尚未载入。 */
      function useDayRecords(date) {
        const pair = React.useState(null)
        const records = pair[0]
        const setRecords = pair[1]
        React.useEffect(() => {
          if (!date) { setRecords(null); return undefined }
          let alive = true
          setRecords(null)
          apiCall('get-day-records', { date: date }).then((value) => {
            if (!alive || !value || typeof value !== 'object') return
            setRecords(Array.isArray(value.records) ? value.records : [])
          }).catch(() => { if (alive) setRecords([]) })
          return () => { alive = false }
        }, [date])
        return records
      }

      function fmtTokens(value) {
        const n = Number(value) || 0
        if (n >= 1000000000) return (n / 1000000000).toFixed(2) + 'B'
        if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
        return String(Math.round(n))
      }

      function fmtDur(ms) {
        if (!(ms > 0)) return '—'
        const s = Math.round(ms / 1000)
        if (s < 60) return s + 's'
        if (s < 3600) return Math.floor(s / 60) + 'm' + (s % 60 ? (s % 60) + 's' : '')
        return Math.floor(s / 3600) + 'h' + Math.floor((s % 3600) / 60) + 'm'
      }

      function parseDate(key) {
        const parts = String(key).split('-').map(Number)
        return new Date(parts[0], parts[1] - 1, parts[2])
      }

      /** 本地日历日期 key，口径与宿主 dayKeyOf 一致（补零），用于按 key 取值。 */
      function dayKeyOf(date) {
        const pad = (n) => String(n).padStart(2, '0')
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
      }

      /** 热力图窗口长度：最近 90 天（含今天），与宿主 90 天保留期一致。 */
      const HEATMAP_DAYS = 90

      /** 构造连续日期窗口：从 (size-1) 天前逐日推进到今天，一天一格。
       *  宿主返回的 dailyAll 只含「有活动的日子」，所以先建 date→数据 映射再按 key 取值，
       *  窗口内缺失的日期补零值单元格 —— 否则任一空白日都会让后续格子的星期对齐错位，
       *  数据稀疏时图幅还会退化成一两列。 */
      function buildDailyWindow(daily, size) {
        const byDate = new Map()
        for (const day of Array.isArray(daily) ? daily : []) {
          if (day && day.date) byDate.set(String(day.date), day)
        }
        const today = new Date()
        // 窗口末端默认取浏览器时钟；但日期 key 是宿主按自己的时钟分桶的，
        // 两端相差一天时（远端 GUI、时钟漂移）宿主最新一天会落在窗口之外而不可见。
        // 因此数据里若出现比浏览器今天更晚的日期，就以该日期作为锚点兜底。
        let anchor = today
        let latestKey = ''
        for (const key of byDate.keys()) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(key) && key > latestKey) latestKey = key
        }
        if (latestKey > dayKeyOf(today)) {
          const parts = latestKey.split('-').map(Number)
          anchor = new Date(parts[0], parts[1] - 1, parts[2])
        }
        const list = []
        for (let offset = size - 1; offset >= 0; offset -= 1) {
          const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - offset)
          const key = dayKeyOf(date)
          const day = byDate.get(key)
          list.push(day || { date: key, requests: 0, prompt: 0, completion: 0, cache_read: 0, total: 0, tools: 0, turns: 0, steps: 0 })
        }
        return list
      }

      /** 该日期所在周的周一（本地日历，周一为周首），跨夏令时安全。 */
      function mondayOf(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7))
      }

      function Icon({ paths, size }) {
        return React.createElement('svg', { viewBox: '0 0 24 24', width: size || 17, height: size || 17, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, dangerouslySetInnerHTML: { __html: paths } })
      }

      /** 浮层：本项目只提供用量统计一个页面。 */
      function OverlayContent({ onClose }) {
        return React.createElement('div', { className: 'duc-overlay', onClick: onClose },
          React.createElement('div', { className: 'duc-overlay-card', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'duc-overlay-head' },
              React.createElement('span', { className: 'duc-overlay-title' }, '用量统计'),
              React.createElement('button', { type: 'button', className: 'duc-btn', onClick: onClose }, '✕ 关闭'),
            ),
            React.createElement('div', { className: 'duc-overlay-body' }, React.createElement(UsagePage, null)),
          ),
        )
      }

      function IconBarButton({ paths, label }) {
        const pair = React.useState(false)
        const open = pair[0]
        const setOpen = pair[1]
        const children = [
          React.createElement('button', { key: 'b', type: 'button', className: 'duc-ibar' + (open ? ' duc-ibar-on' : ''), onClick: () => setOpen(!open), title: label, 'aria-label': label },
            React.createElement(Icon, { paths: paths, size: 16 })),
        ]
        if (open) {
          children.push(React.createElement(OverlayContent, { key: 'o', onClose: () => setOpen(false) }))
        }
        return React.createElement('div', { className: 'duc-ibar-wrap' }, ...children)
      }

      /** 指标条：合并原先的两排瓦片（原 UsageTiles 的「总消耗」与 MetricCards 的
       *  「累计 Token」取的是同一个 stats.totals.total，属同一数字显示两遍）。
       *  主指标只留 4 张，其余压成底部一行小字，避免首屏被 8 张瓦片占满。 */
      function MetricStrip({ stats, range }) {
        const totals = stats.totals
        const prev = stats.prevTotals
        const peak = stats.sessionPeak
        const longest = stats.longestChat
        const streaks = stats.streaks || { current: 0, longest: 0 }
        const live = stats.live || {}
        const delta = (current, previous) => {
          if (!prev || !previous) return null
          const value = ((current || 0) / previous - 1) * 100
          return React.createElement('span', { key: 'd', title: '对比上一周期' },
            value >= 0 ? '▲' : '▼', ' ', Math.abs(value).toFixed(0) + '%')
        }
        const hit = totals.prompt > 0 ? (totals.cache_read / totals.prompt) * 100 : null
        const days = Math.max(1, (stats.daily || []).length)
        const dailyAvg = range === '1d' ? '' : ' · 日均 ' + (totals.requests / days).toFixed(1) + ' 次'
        const fresh = Math.max(0, totals.prompt - totals.cache_read)
        const ringBg = hit === null
          ? 'rgba(128,128,128,.15)'
          : 'conic-gradient(var(--duc-c3) ' + hit + '%, rgba(128,128,128,.15) 0)'
        const primary = [
          React.createElement('div', { key: 'p1', className: 'duc-u-tile' },
            React.createElement('div', { className: 'duc-u-tile-label' }, '总消耗', delta(totals.total, prev && prev.total)),
            React.createElement('div', { className: 'duc-u-tile-value' }, fmtTokens(totals.total), React.createElement('small', null, 'tokens')),
            React.createElement('div', { className: 'duc-u-tile-sub' }, '输入 ' + fmtTokens(totals.prompt) + ' · 输出 ' + fmtTokens(totals.completion)),
          ),
          React.createElement('div', { key: 'p2', className: 'duc-u-tile' },
            React.createElement('div', { className: 'duc-u-tile-label' }, '请求数', delta(totals.requests, prev && prev.requests)),
            React.createElement('div', { className: 'duc-u-tile-value' }, Number(totals.requests || 0).toLocaleString()),
            React.createElement('div', { className: 'duc-u-tile-sub' }, '全部模型调用' + dailyAvg),
          ),
          React.createElement('div', { key: 'p3', className: 'duc-u-tile' },
            React.createElement('div', { className: 'duc-u-tile-label' }, '缓存命中率'),
            React.createElement('div', { className: 'duc-u-ringwrap' },
              React.createElement('div', { className: 'duc-u-ring', style: { background: ringBg } },
                React.createElement('b', null, hit === null ? '—' : Math.round(hit) + '%')),
              React.createElement('div', { className: 'duc-u-tile-sub' },
                React.createElement('div', null, '命中 ' + fmtTokens(totals.cache_read)),
                React.createElement('div', null, '新输入 ' + fmtTokens(fresh)),
              ),
            ),
          ),
          React.createElement('div', { key: 'p4', className: 'duc-u-tile' },
            React.createElement('div', { className: 'duc-u-tile-label' }, '连续天数'),
            React.createElement('div', { className: 'duc-u-tile-value' }, String(streaks.current), React.createElement('small', null, '天')),
            React.createElement('div', { className: 'duc-u-tile-sub' }, '最长 ' + streaks.longest + ' 天'),
          ),
        ]
        const chip = (key, label, value, title) => React.createElement('span', { key: key, className: 'duc-u-chip', title: title || '' },
          React.createElement('i', null, label), value)
        const secondary = [
          chip('s1', '单会话峰值', peak ? fmtTokens(peak.tokens) + ' tokens' : '—', peak ? (peak.title || '') + (peak.date ? ' · ' + peak.date : '') : ''),
          chip('s2', '最长聊天', longest ? fmtDur(longest.durationMs) : '—', longest ? (longest.title || '') : ''),
          chip('s3', '轮次/步数', String(totals.turns) + ' 轮 · ' + String(totals.steps) + ' 步 · 工具 ' + String(totals.tools) + ' 次'),
          chip('s4', '耗时', 'LLM ' + fmtDur(live.llmMs) + ' · 工具 ' + fmtDur(live.toolMs)),
          chip('s5', '性能', '首 token ' + (live.firstTokenCount ? live.firstTokenMs.toFixed(1) + 's' : '—') + ' · ' + (live.tokPerSec || 0).toFixed(0) + ' tok/s'),
        ]
        return React.createElement('div', { className: 'duc-u-metrics' },
          React.createElement('div', { className: 'duc-u-tiles' }, ...primary),
          React.createElement('div', { className: 'duc-u-sub' }, ...secondary),
        )
      }

      /** 热力图三视图：每日（GitHub 网格）/ 每周（柱状）/ 累计（折线）。
       *  三视图共用同一连续日期窗口（最近 90 天，含今天；缺失日期补零），
       *  行序固定 周一→周日 并与真实星期对齐，今天恒定落在窗口最后一格。
       *  自定义悬浮提示替代原生 title；点击某天联动当日明细。 */
      function UsageHeatmap({ daily, selectedDate, onSelectDate }) {
        const [view, setView] = React.useState('day')
        const [tip, setTip] = React.useState(null)
        const days = buildDailyWindow(daily, HEATMAP_DAYS)
        const totalTokens = days.reduce((sum, d) => sum + (Number(d.total) || 0), 0)
        const totalRequests = days.reduce((sum, d) => sum + (Number(d.requests) || 0), 0)
        const views = [['day', '每日'], ['week', '每周'], ['cum', '累计']]
        let body = null

        if (view === 'day') {
          // 分档基准取窗口内有数据日期的最大值（缺失日补零，不参与拉高基准）。
          const max = Math.max(1, ...days.map((d) => Number(d.total) || 0))
          // 首列前置空格数：让窗口第 0 天落在它真实的星期行上（行 0 = 周一）。
          const lead = (parseDate(days[0].date).getDay() + 6) % 7
          const columns = Math.ceil((lead + days.length) / 7)
          const cols = []
          for (let col = 0; col < columns; col += 1) {
            const cells = []
            for (let row = 0; row < 7; row += 1) {
              const idx = col * 7 + row - lead
              if (idx < 0 || idx >= days.length) {
                // 窗口之外：只为撑满 7 行的对齐占位格。用独立类名，避免与窗口内
                // level 0 的空数据格同色、并避开 .duc-u-heat-cell:hover 的描边。
                cells.push(React.createElement('i', { key: row, className: 'duc-u-heat-pad' }))
                continue
              }
              const day = days[idx]
              const total = Number(day.total) || 0
              const level = total === 0 ? 0 : Math.min(4, 1 + Math.floor((total / max) * 3.99))
              cells.push(React.createElement('i', {
                key: row,
                className: 'duc-u-heat-cell' + (selectedDate === day.date ? ' duc-u-heat-sel' : ''),
                'data-l': String(level),
                onMouseEnter: (event) => setTip({
                  x: event.currentTarget.offsetLeft,
                  y: event.currentTarget.offsetTop,
                  date: day.date,
                  lines: [
                    fmtTokens(total) + ' tokens',
                    (Number(day.requests) || 0) + ' 次请求',
                    '轮 ' + (Number(day.turns) || 0) + ' · 步 ' + (Number(day.steps) || 0) + ' · 工具 ' + (Number(day.tools) || 0),
                  ],
                }),
                onMouseLeave: () => setTip(null),
                onClick: () => { if (onSelectDate) onSelectDate(selectedDate === day.date ? '' : day.date) },
              }))
            }
            cols.push(React.createElement('div', { key: col, className: 'duc-u-heat-col' }, ...cells))
          }
          const monthLabels = []
          let previousMonth = -1
          for (let col = 0; col < columns; col += 1) {
            const idx = Math.min(Math.max(0, col * 7 - lead), days.length - 1)
            const month = parseDate(days[idx].date).getMonth()
            if (month !== previousMonth) {
              monthLabels.push(React.createElement('span', { key: col, className: 'duc-u-heat-month', style: { left: ((col / columns) * 100) + '%' } }, (month + 1) + '月'))
              previousMonth = month
            }
          }
          const weekdays = ['一', '', '三', '', '五', '', ''].map((label, row) => React.createElement('span', { key: row }, label))
          body = React.createElement('div', { className: 'duc-u-heat-wrap' },
            React.createElement('div', { className: 'duc-u-heat-months' }, ...monthLabels),
            React.createElement('div', { className: 'duc-u-heat-body' },
              React.createElement('div', { className: 'duc-u-heat-weekdays' }, ...weekdays),
              React.createElement('div', { className: 'duc-u-heat-cols' }, ...cols),
            ),
            tip ? React.createElement('div', { className: 'duc-u-tip', style: { left: tip.x + 'px', top: tip.y + 'px' } },
              React.createElement('b', null, tip.date),
              ...tip.lines.map((line, index) => React.createElement('div', { key: index }, line)),
            ) : null,
          )
        } else if (view === 'week') {
          // 与每日视图同窗口：按周一为周首分桶后，枚举窗口首日到末日的每个周一，
          // 空周同样渲染 0 值柱，柱数恒等于每日视图的列数。
          const byWeek = new Map()
          for (const day of days) {
            const monday = mondayOf(parseDate(day.date))
            const key = dayKeyOf(monday)
            let bucket = byWeek.get(key)
            if (!bucket) {
              bucket = { key: key, total: 0, requests: 0 }
              byWeek.set(key, bucket)
            }
            bucket.total += Number(day.total) || 0
            bucket.requests += Number(day.requests) || 0
          }
          const windowStart = parseDate(days[0].date)
          const windowEnd = parseDate(days[days.length - 1].date)
          const lastMonday = mondayOf(windowEnd)
          const list = []
          let cursor = mondayOf(windowStart)
          while (cursor.getTime() <= lastMonday.getTime()) {
            const key = dayKeyOf(cursor)
            const bucket = byWeek.get(key) || { key: key, total: 0, requests: 0 }
            // 窗口首尾可能是部分周：标签按窗口内的真实起止日标注，
            // 否则首周标签会显示窗口开始之前的周一日期。
            const weekMonday = cursor
            const weekSunday = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 6)
            const from = weekMonday.getTime() < windowStart.getTime() ? windowStart : weekMonday
            const to = weekSunday.getTime() > windowEnd.getTime() ? windowEnd : weekSunday
            const fmtDay = (d) => (d.getMonth() + 1) + '/' + d.getDate()
            list.push({
              key: key,
              total: bucket.total,
              requests: bucket.requests,
              label: fmtDay(from),
              range: fmtDay(from) + '–' + fmtDay(to),
            })
            cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
          }
          const max = Math.max(1, ...list.map((w) => w.total))
          body = React.createElement('div', { className: 'duc-u-week' },
            ...list.map((week) => React.createElement('div', {
              key: week.key,
              className: 'duc-u-week-col',
              title: week.range + '：' + fmtTokens(week.total) + ' tokens · ' + week.requests + ' 次请求',
            },
              React.createElement('div', { className: 'duc-u-week-bar', style: { height: Math.max(2, (week.total / max) * 100) + '%' } }),
              React.createElement('span', { className: 'duc-u-week-x' }, week.label),
            )),
          )
        } else {
          // 同一窗口逐日累加：缺失日期按 0 计入，末点即窗口内有数据日期的总量。
          let running = 0
          const points = days.map((day, index) => {
            running += Number(day.total) || 0
            return { index: index, value: running }
          })
          const max = Math.max(1, running)
          const width = 100
          const height = 34
          const coords = points.map((point) => {
            const x = points.length === 1 ? 0 : (point.index / (points.length - 1)) * width
            const y = height - (point.value / max) * height
            return x.toFixed(2) + ',' + y.toFixed(2)
          }).join(' ')
          const last = points[points.length - 1]
          body = React.createElement('div', { className: 'duc-u-cumwrap' },
            React.createElement('svg', { className: 'duc-u-cum', viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'none', role: 'img' },
              React.createElement('polyline', { points: coords, fill: 'none', stroke: 'var(--duc-c1)', strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' }),
            ),
            React.createElement('div', { className: 'duc-hint' }, days[0].date + ' → ' + days[days.length - 1].date + '：累计 ' + fmtTokens(last.value) + ' tokens'),
          )
        }

        return React.createElement('div', { className: 'duc-u-card' },
          React.createElement('div', { className: 'duc-u-card-head' },
            React.createElement('h3', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, '用量日历'),
            React.createElement('div', { className: 'duc-u-seg' },
              ...views.map((v) => React.createElement('button', {
                key: v[0], type: 'button', className: v[0] === view ? 'on' : '',
                onClick: () => { setView(v[0]); setTip(null) },
              }, v[1])),
            ),
          ),
          body,
          React.createElement('div', { className: 'duc-u-heat-total' },
            '共 ' + totalRequests.toLocaleString() + ' 次调用 · ' + fmtTokens(totalTokens) + ' tokens',
            view === 'day' && onSelectDate ? React.createElement('span', { className: 'duc-hint', style: { marginLeft: 8 } }, selectedDate ? '已选 ' + selectedDate : '点击某天查看当日明细') : null,
          ),
        )
      }

      /** 点击热力图某天后的当日明细；模型维度取自宿主的 dailyModels 映射。 */
      function DayDetail({ date, stats, onClear, onOpenRecords }) {
        const day = (stats.dailyAll || stats.daily || []).find((d) => d.date === date)
        const models = (stats.dailyModels || {})[date] || []
        const headActions = []
        if (onOpenRecords) {
          headActions.push(React.createElement('button', {
            key: 'open', type: 'button', className: 'duc-btn', style: { marginLeft: 'auto' },
            onClick: onOpenRecords,
          }, '查看该日调用 →'))
        }
        headActions.push(React.createElement('button', {
          key: 'clear', type: 'button', className: 'duc-btn',
          style: onOpenRecords ? { marginLeft: 8 } : { marginLeft: 'auto' },
          onClick: onClear,
        }, '✕ 清除'))
        const children = [
          React.createElement('div', { key: 'head', className: 'duc-u-card-head' },
            React.createElement('h3', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, date + ' 当日明细'),
            ...headActions,
          ),
        ]
        if (day) {
          children.push(React.createElement('div', { key: 'sum', className: 'duc-u-day-sum' },
            '请求 ' + day.requests + ' · 轮 ' + day.turns + ' · 步 ' + day.steps + ' · 工具 ' + day.tools + ' · 缓存读 ' + fmtTokens(day.cache_read)))
        }
        if (models.length) {
          children.push(React.createElement('div', { key: 'rows', className: 'duc-u-day-rows' },
            ...models.map((m) => React.createElement('div', { key: m.model, className: 'duc-u-day-row' },
              React.createElement('span', { className: 'duc-u-day-model', title: m.model }, m.model),
              React.createElement('span', { className: 'duc-u-num' }, fmtTokens(m.tokens) + ' tokens'),
              React.createElement('span', { className: 'duc-hint' }, m.requests + ' 次'),
            )),
          ))
        } else {
          children.push(React.createElement('div', { key: 'none', className: 'duc-u-empty' }, '该日没有模型调用记录'))
        }
        return React.createElement('div', { className: 'duc-u-card' }, ...children)
      }

      function UsageBars({ daily, range }) {
        let slice = daily || []
        let weekly = false
        if (range === '1d') slice = slice.slice(-2)
        else if (range === '7d') slice = slice.slice(-7)
        else if (range === '30d') slice = slice.slice(-30)
        else {
          weekly = true
          const merged = []
          const weeks = Math.floor(slice.length / 7)
          for (let week = 0; week < weeks; week += 1) {
            const chunk = slice.slice(slice.length - (weeks - week) * 7, slice.length - (weeks - week - 1) * 7)
            if (!chunk.length) continue
            const m = { date: chunk[0].date, requests: 0, prompt: 0, completion: 0, cache_read: 0, total: 0 }
            for (const day of chunk) {
              m.requests += day.requests; m.prompt += day.prompt; m.completion += day.completion
              m.cache_read += day.cache_read; m.total += day.total
            }
            merged.push(m)
          }
          slice = merged
        }
        const HEIGHT = 200
        const max = Math.max(...slice.map((d) => d.total), 0)
        const children = []
        if (!max) {
          children.push(React.createElement('div', { key: 'empty', className: 'duc-u-empty' }, '该范围内没有调用记录'))
          return React.createElement('div', { className: 'duc-u-card' }, ...children)
        }
        const rawStep = max / 4
        const stepPow = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))))
        const stepUnit = rawStep / stepPow
        const step = (stepUnit <= 1 ? 1 : stepUnit <= 2 ? 2 : stepUnit <= 5 ? 5 : 10) * stepPow
        const grid = [React.createElement('div', { key: 'g0', className: 'duc-u-gridline', style: { bottom: 0 } }),
          React.createElement('span', { key: 'y0', className: 'duc-u-y', style: { bottom: 0 } }, '0')]
        for (let value = step; value <= max; value += step) {
          grid.push(React.createElement('div', { key: 'g' + value, className: 'duc-u-gridline', style: { bottom: (value / max) * HEIGHT + 'px' } }))
          grid.push(React.createElement('span', { key: 'y' + value, className: 'duc-u-y', style: { bottom: (value / max) * HEIGHT + 'px' } }, fmtTokens(value)))
        }
        const bars = []
        const xlabels = []
        slice.forEach((day, index) => {
          const fresh = Math.max(0, day.prompt - day.cache_read)
          const segments = []
          for (const pair of [[fresh, 'duc-u-s1'], [day.completion, 'duc-u-s2'], [day.cache_read, 'duc-u-s3']]) {
            segments.push(React.createElement('i', { key: pair[1], className: pair[1], style: { height: Math.max(pair[0] > 0 ? 1 : 0, (pair[0] / max) * HEIGHT) + 'px' } }))
          }
          const tip = day.date + (weekly ? ' 起当周' : '') + '\n新输入 ' + fmtTokens(fresh) + ' · 输出 ' + fmtTokens(day.completion) + ' · 缓存命中 ' + fmtTokens(day.cache_read) + '\n请求 ' + day.requests + ' · 合计 ' + fmtTokens(day.total)
          bars.push(React.createElement('div', { key: day.date, className: 'duc-u-bar-slot', title: tip },
            React.createElement('div', { className: 'duc-u-bar-col' }, ...segments)))
          let labelText = ''
          if (weekly) labelText = index % 4 ? '' : day.date.slice(5)
          else if (slice.length > 16) labelText = index % 5 ? '' : day.date.slice(5)
          else if (slice.length === 1) labelText = day.date.slice(5)
          else labelText = day.date.slice(8)
          xlabels.push(React.createElement('span', { key: day.date }, labelText))
        })
        children.push(React.createElement('div', { key: 'head', className: 'duc-u-card-head' },
          React.createElement('h3', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, '消耗趋势'),
          React.createElement('span', { className: 'duc-hint' }, weekly ? '按周聚合 · 悬停看明细' : '悬停看明细'),
        ))
        children.push(React.createElement('div', { key: 'legend', className: 'duc-row', style: { marginBottom: 4 } },
          React.createElement('span', { className: 'duc-hint' }, React.createElement('i', { style: { display: 'inline-block', width: 8, height: 8, background: 'var(--duc-c1)', borderRadius: 2, marginRight: 4 } }), '新输入'),
          React.createElement('span', { className: 'duc-hint' }, React.createElement('i', { style: { display: 'inline-block', width: 8, height: 8, background: 'var(--duc-c2)', borderRadius: 2, marginRight: 4 } }), '输出'),
          React.createElement('span', { className: 'duc-hint' }, React.createElement('i', { style: { display: 'inline-block', width: 8, height: 8, background: 'var(--duc-c3)', borderRadius: 2, marginRight: 4 } }), '缓存命中'),
        ))
        children.push(React.createElement('div', { key: 'chart', className: 'duc-u-bars-wrap' },
          React.createElement('div', { className: 'duc-u-bars' }, ...grid, ...bars),
          React.createElement('div', { className: 'duc-u-x' }, ...xlabels),
        ))
        return React.createElement('div', { className: 'duc-u-card' }, ...children)
      }

      function UsageModels({ stats }) {
        const models = stats.models || []
        const totalTokens = stats.totals.total
        const colors = ['var(--duc-c1)', 'var(--duc-c2)', 'var(--duc-c3)', 'var(--duc-c4)']
        const children = []
        children.push(React.createElement('div', { key: 'head', className: 'duc-u-card-head' },
          React.createElement('h3', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, '模型消耗明细'),
          React.createElement('span', { className: 'duc-hint' }, '同一模型全页同色'),
        ))
        if (!models.length || !totalTokens) {
          children.push(React.createElement('div', { key: 'empty', className: 'duc-u-empty' }, '该范围内没有调用记录'))
          return React.createElement('div', { className: 'duc-u-card' }, ...children)
        }
        const segments = []
        let acc = 0
        models.forEach((model, index) => {
          const share = (model.total / totalTokens) * 100
          segments.push(colors[index % colors.length] + ' ' + acc + '% ' + (acc + share) + '%')
          acc += share
        })
        const rows = models.map((model, index) => {
          const share = totalTokens ? ((model.total / totalTokens) * 100) : 0
          const cells = [
            React.createElement('td', { key: 'm' }, React.createElement('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colors[index % colors.length], marginRight: 6 } }), model.model),
            React.createElement('td', { key: 'share', className: 'duc-u-num' }, share.toFixed(1) + '%'),
            React.createElement('td', { key: 'req', className: 'duc-u-num' }, model.requests),
            React.createElement('td', { key: 'in', className: 'duc-u-num' }, fmtTokens(model.input)),
            React.createElement('td', { key: 'out', className: 'duc-u-num' }, fmtTokens(model.output)),
            React.createElement('td', { key: 'cache', className: 'duc-u-num' }, model.cacheRead ? fmtTokens(model.cacheRead) : '—'),
          ]
          return React.createElement('tr', { key: model.model }, ...cells)
        })
        const donut = React.createElement('div', { className: 'duc-u-donut', style: { background: 'conic-gradient(' + segments.join(',') + ')' } },
          React.createElement('b', null, Number(stats.totals.requests || 0).toLocaleString(), React.createElement('small', null, '次请求')))
        const table = React.createElement('div', { className: 'duc-u-table-scroll' },
          React.createElement('table', { className: 'duc-table' },
            React.createElement('thead', null, React.createElement('tr', { key: 'h' },
              React.createElement('th', { key: 'm' }, '模型'),
              React.createElement('th', { key: 's', className: 'duc-u-num' }, '占比'),
              React.createElement('th', { key: 'r', className: 'duc-u-num' }, '请求'),
              React.createElement('th', { key: 'i', className: 'duc-u-num' }, '输入'),
              React.createElement('th', { key: 'o', className: 'duc-u-num' }, '输出'),
              React.createElement('th', { key: 'c', className: 'duc-u-num' }, '缓存命中'),
            )),
            React.createElement('tbody', null, ...rows),
          ),
        )
        children.push(React.createElement('div', { key: 'body', className: 'duc-u-modelbody' }, donut, table))
        return React.createElement('div', { className: 'duc-u-card' }, ...children)
      }

      function UsageRecords({ stats, modelFilter, onModelFilter, dateFilter, dayRecords, onClearDate }) {
        const models = stats.models || []
        const records = stats.records || []
        const children = []
        const filterHint = dateFilter
          ? (dayRecords === null ? dateFilter + ' · 正在载入该日明细…' : dateFilter + ' · 该日 ' + dayRecords.length + ' 条')
          : '最近 50 条'
        children.push(React.createElement('div', { key: 'head', className: 'duc-u-card-head' },
          React.createElement('h3', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, '调用明细'),
          React.createElement('span', { className: 'duc-hint' }, filterHint),
          React.createElement('select', { className: 'duc-input', style: { marginLeft: 'auto' }, value: modelFilter, onChange: (e) => onModelFilter(e.target.value) },
            React.createElement('option', { value: '' }, '全部模型'),
            ...models.map((m) => React.createElement('option', { key: m.model, value: m.model }, m.model)),
          ),
          dateFilter && onClearDate
            ? React.createElement('button', { key: 'clear', type: 'button', className: 'duc-btn', onClick: onClearDate }, '✕ 取消日期筛选')
            : null,
        ))
        // 选中某天时用宿主返回的「该日明细」：全局 records 只有最近 50 条，
        // 在较早的日期上按时间过滤必然是空的。
        const byDate = dateFilter ? (dayRecords || []) : records
        const filtered = modelFilter ? byDate.filter((r) => r.model === modelFilter) : byDate
        if (!filtered.length) {
          const emptyText = dateFilter
            ? (dayRecords === null ? '正在载入该日明细…' : '该日没有调用记录')
            : '该范围内没有调用记录'
          children.push(React.createElement('div', { key: 'empty', className: 'duc-u-empty' }, emptyText))
          return React.createElement('div', { className: 'duc-u-card' }, ...children)
        }
        const rows = filtered.map((record, index) => {
          const d = new Date(record.time)
          const time = d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
          const cells = [
            React.createElement('td', { key: 't' }, time),
            React.createElement('td', { key: 's' }, record.sessionId),
            React.createElement('td', { key: 'm' }, record.model),
            React.createElement('td', { key: 'i', className: 'duc-u-num' }, fmtTokens(record.input)),
            React.createElement('td', { key: 'o', className: 'duc-u-num' }, fmtTokens(record.output)),
            React.createElement('td', { key: 'c', className: 'duc-u-num' }, record.cacheRead ? fmtTokens(record.cacheRead) : '—'),
          ]
          return React.createElement('tr', { key: index + '-' + record.time }, ...cells)
        })
        children.push(React.createElement('table', { key: 'table', className: 'duc-table' },
          React.createElement('thead', null, React.createElement('tr', { key: 'h' },
            React.createElement('th', { key: 't' }, '时间'),
            React.createElement('th', { key: 's' }, '会话'),
            React.createElement('th', { key: 'm' }, '模型'),
            React.createElement('th', { key: 'i', className: 'duc-u-num' }, '输入'),
            React.createElement('th', { key: 'o', className: 'duc-u-num' }, '输出'),
            React.createElement('th', { key: 'c', className: 'duc-u-num' }, '缓存命中'),
          )),
          React.createElement('tbody', null, ...rows),
        ))
        return React.createElement('div', { className: 'duc-u-card' }, ...children)
      }

      /** 用量统计页：按「概览 / 趋势 / 明细」三个标签页分区，取代原先 8 个区块
       *  纵向堆叠成一条长滚动。范围切换与刷新对所有分区生效；热力图点选的日期
       *  会跨分区保留（概览看当日明细，明细看当日调用），并在概览里提供跳转入口。 */
      function UsagePage() {
        const [range, setRange] = React.useState('7d')
        const [tab, setTab] = React.useState('overview')
        const [modelFilter, setModelFilter] = React.useState('')
        // 热力图点击的日期：非空时联动当日明细与调用明细筛选。
        const [selectedDate, setSelectedDate] = React.useState('')
        const dayRecords = useDayRecords(selectedDate)
        const pair = useUsageState(range)
        const snapshot = pair[0]
        const children = []
        const ranges = [['1d', '1天'], ['7d', '7天'], ['30d', '30天'], ['all', '至今']]
        const tabs = [['overview', '概览'], ['trends', '趋势'], ['details', '明细']]
        children.push(React.createElement('div', { key: 'toolbar', className: 'duc-u-toolbar' },
          React.createElement('div', { className: 'duc-u-tabs' },
            ...tabs.map((t) => React.createElement('button', {
              key: t[0], type: 'button', className: t[0] === tab ? 'on' : '',
              'data-tab': t[0], onClick: () => setTab(t[0]),
            }, t[1])),
          ),
          React.createElement('div', { className: 'duc-u-seg duc-u-seg-end' },
            ...ranges.map((r) => React.createElement('button', { key: r[0], type: 'button', className: r[0] === range ? 'on' : '', onClick: () => setRange(r[0]) }, r[1])),
          ),
          React.createElement('span', { className: 'duc-hint' }, snapshot ? '更新于 ' + new Date(snapshot.updatedAt).toLocaleTimeString() : '正在载入…'),
          React.createElement('button', { type: 'button', className: 'duc-btn', onClick: () => { apiCall('get-usage', { range: range }).then((value) => { if (value && typeof value === 'object') pair[1](value) }).catch(() => {}) } }, '↻'),
        ))
        if (!snapshot) {
          children.push(React.createElement('div', { key: 'loading', className: 'duc-hint' }, '正在连接 Host…'))
          return React.createElement('div', { className: 'duc-page' }, ...children)
        }
        if (snapshot.error) {
          children.push(React.createElement('div', { key: 'err', className: 'duc-err' }, '用量统计不可用：' + snapshot.error))
          return React.createElement('div', { className: 'duc-page' }, ...children)
        }
        if (!snapshot.ready) {
          children.push(React.createElement('div', { key: 'loading', className: 'duc-hint' }, '正在扫描会话历史…'))
          return React.createElement('div', { className: 'duc-page' }, ...children)
        }
        const stats = snapshot.stats
        if (tab === 'overview') {
          children.push(React.createElement(MetricStrip, { key: 'metrics', stats: stats, range: range }))
          children.push(React.createElement(UsageHeatmap, {
            key: 'heat',
            daily: stats.dailyAll || stats.daily,
            selectedDate: selectedDate,
            onSelectDate: setSelectedDate,
          }))
          if (selectedDate) {
            children.push(React.createElement(DayDetail, {
              key: 'day',
              date: selectedDate,
              stats: stats,
              onClear: () => setSelectedDate(''),
              onOpenRecords: () => setTab('details'),
            }))
          }
        } else if (tab === 'trends') {
          children.push(React.createElement(UsageBars, { key: 'bars', daily: stats.daily, range: range }))
          children.push(React.createElement(UsageModels, { key: 'models', stats: stats }))
        } else {
          children.push(React.createElement(UsageRecords, {
            key: 'records',
            stats: stats,
            modelFilter: modelFilter,
            onModelFilter: setModelFilter,
            dateFilter: selectedDate,
            dayRecords: dayRecords,
            onClearDate: () => setSelectedDate(''),
          }))
        }
        return React.createElement('div', { className: 'duc-page' }, ...children)
      }

      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('conversation.input.right', () => slots.register(
        { name: 'conversation.input.right', id: 'duc-usage', order: 110, label: '用量统计' },
        () => React.createElement(IconBarButton, { paths: '<path d="M6 20V10"/><path d="M12 20V4"/><path d="M18 20v-6"/>', label: '用量统计' }),
      ))
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
