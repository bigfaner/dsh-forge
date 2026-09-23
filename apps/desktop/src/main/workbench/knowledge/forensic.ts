// workbench/knowledge/forensic — 会话取证只读数据面(任务 2.2,D4 只读)。
//
// 移植基准 = forge-cli `internal/cmd/forensic`(Go 权威,逐命令对齐):
//   - search    ← search.go:读 history.jsonl(home 下 ~/.claude/history.jsonl),
//     按 projectPath 子串 / sessionId 前缀 / keyword(display 小写子串)/
//     skill('/'+name 或 'forge:'+name 小写子串)过滤;按 sessionId 聚合
//     {sessionId, project, dateTime(最大 ts,'YYYY-MM-DD HH:mm'), msgCount,
//     firstMsg(首个 display 截 80)};dateTime 降序;limit last(缺省 20)。
//   - extract   ← extract.go + helpers.go:解析会话 JSONL(assistant/user/
//     attachment 三类行),产出 thinking/toolCalls/toolResults/userMsgs/
//     skillsUsed/hooks/filesEdited + summary(计数/分组/timing 聚合/时间
//     范围)。截断口径逐字对齐(thinking 500 / tool input 300 / user 300 /
//     firstMsg 80 / command 200;runes 计数)。
//   - subagents ← subagents.go:读 <sessionDir>/subagents/*.meta.json →
//     {agentId(去 agent- 前缀), agentType, transcript 路径}。
//
// 只读纪律(D4/归宿表「dsh tool 只读」):Go extract 的 --slug/--out 文件
// 写腿(face evidence 落盘)不在工具面 —— 本模块零写入,证据以值返回,
// 落盘归 M4 技能迁移期裁决。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { KnowledgeDomainError } from './knowledge-error.ts'

// ---------------------------------------------------------------------------
// 公共形状(Go types.go 同形;camelCase 投影)
// ---------------------------------------------------------------------------

/** Go sessionSummary 同形。 */
export interface ForensicSessionSummary {
  readonly sessionId: string
  readonly project: string
  readonly dateTime: string
  readonly msgCount: number
  readonly firstMsg: string
}

/** Go thinkingEntry 同形。 */
interface ThinkingEntry { line: number; thinking: string; stopReason?: string; model?: string; msgId?: string }
/** Go toolCallEntry 同形。 */
interface ToolCallEntry { line: number; tool: string; input: string; stopReason?: string; msgId?: string }
/** Go toolResultEntry 同形。 */
interface ToolResultEntry { line: number; toolUseId: string; resultType?: string; filePath?: string }
/** Go userMsgEntry 同形。 */
interface UserMsgEntry { line: number; content: string; isMeta: boolean }
/** Go hookEventEntry 同形。 */
interface HookEventEntry { line: number; hookName: string; hookEvent: string; durationMs: number; exitCode: number; command: string }
/** Go toolAggEntry / timingEntry / timingAgg / thinkingTurn 同形。 */
interface ToolAggEntry { name: string; count: number }
interface TimingEntry { tool: string; line: number; seconds: number; detail?: string }
interface TimingAgg { tool: string; count: number; total: number; average: number; max: number }
interface ThinkingTurn { line: number; seconds: number; stopReason?: string; detail?: string }

/** Go extractSummary 同形(全字段)。 */
export interface ForensicEvidenceSummary {
  totalThinking: number
  totalToolCalls: number
  totalToolResults: number
  totalUserMsgs: number
  toolBreakdown: Record<string, number>
  filesRead: string[]
  filesWritten: string[]
  grepPatterns: string[]
  agentsSpawned: ToolAggEntry[]
  commands: string[]
  hookBreakdown: ToolAggEntry[]
  hookFailures: number
  compactCount: number
  planModeCount: number
  stopReasons: Record<string, number>
  skillInvocations: ToolAggEntry[]
  subagentCount: number
  startTime: string
  endTime: string
  duration: string
  topSlowest: TimingEntry[]
  timingByTool: TimingAgg[]
  totalToolMs: number
  thinkingTurns: ThinkingTurn[]
  totalThinkingMs: number
}

/** Go extractResult 同形。 */
export interface ForensicEvidence {
  readonly file: string
  readonly lines: number
  readonly model?: string
  readonly gitBranch?: string
  readonly thinking: ThinkingEntry[]
  readonly toolCalls: ToolCallEntry[]
  readonly toolResults: ToolResultEntry[]
  readonly userMsgs: UserMsgEntry[]
  readonly skillsUsed: string[]
  readonly hooks: HookEventEntry[]
  readonly filesEdited: string[]
  readonly summary: ForensicEvidenceSummary
}

/** Go subagentInfo 同形。 */
export interface ForensicSubagent {
  readonly agentId: string
  readonly agentType: string
  readonly transcript: string
}

// ---------------------------------------------------------------------------
// 共用小工具(Go helpers.go 同义)
// ---------------------------------------------------------------------------

function unreadable(what: string, detail: string): KnowledgeDomainError {
  return new KnowledgeDomainError('ERR_FORENSIC_SOURCE_UNREADABLE', `Cannot read ${what}`, detail)
}

/** Go truncate(runes 计数 + '...' 尾)。 */
function truncate(text: string, maxRunes: number): string {
  const runes = [...text]
  if (runes.length <= maxRunes) return text
  return `${runes.slice(0, maxRunes).join('')}...`
}

/** Go parseTimestamp(RFC3339Nano→RFC3339)同义;不可解析 → NaN。 */
function parseTimestampMs(text: string): number {
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? Number.NaN : ms
}

/** Go computeDurationMs:任一端不可解析 → -1。 */
function durationMs(startTS: string, endTS: string): number {
  const from = parseTimestampMs(startTS)
  const to = parseTimestampMs(endTS)
  if (Number.isNaN(from) || Number.isNaN(to)) return -1
  return to - from
}

function addToAgg(entries: ToolAggEntry[], name: string): void {
  const found = entries.find(entry => entry.name === name)
  if (found !== undefined) found.count += 1
  else entries.push({ name, count: 1 })
}

function appendUniq(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value)
}

/** Go '2006-01-02 15:04' 本地时区格式。 */
function formatMinute(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Go '2006-01-02 15:04:05' 本地时区格式。 */
function formatSecond(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => `${n}`.padStart(2, '0')
  return `${formatMinute(ms)}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// search(Go search.go)
// ---------------------------------------------------------------------------

/** history.jsonl 行(Go historyEntry 同形)。 */
interface HistoryEntry { display?: unknown; timestamp?: unknown; project?: unknown; sessionId?: unknown }

export interface ForensicSearchInput {
  /** projectPath 子串过滤(Go strings.Contains,大小写敏感;缺省 = 不过滤)。 */
  readonly projectPath?: string
  /** sessionId 前缀过滤。 */
  readonly session?: string
  /** keyword:display 小写子串过滤。 */
  readonly keyword?: string
  /** skill:'/'+name 或 'forge:'+name(小写子串)。 */
  readonly skill?: string
  /** 结果上限(Go --last,缺省 20)。 */
  readonly last?: number
}

/** search:history.jsonl 不可读 → ERR_FORENSIC_SOURCE_UNREADABLE。 */
export function searchForensicSessions(input: ForensicSearchInput, historyPath: string): ForensicSessionSummary[] {
  if (!existsSync(historyPath)) {
    throw unreadable('history.jsonl', `${historyPath} does not exist (no Claude Code history on this machine?)`)
  }
  let raw: string
  try {
    raw = readFileSync(historyPath, 'utf8')
  } catch (error) {
    throw unreadable('history.jsonl', String(error))
  }

  interface SessionAccumulator { sessionId: string; project: string; dateTime: string; msgCount: number; firstMsg: string; maxMs: number }
  const sessions = new Map<string, SessionAccumulator>()
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') continue
    let entry: HistoryEntry
    try {
      entry = JSON.parse(line) as HistoryEntry
    } catch {
      continue
    }
    const project = typeof entry.project === 'string' ? entry.project : ''
    const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : ''
    const display = typeof entry.display === 'string' ? entry.display : ''
    if (input.projectPath !== undefined && input.projectPath !== '' && !project.includes(input.projectPath)) continue
    if (sessionId === '') continue
    if (input.session !== undefined && input.session !== '' && !sessionId.startsWith(input.session)) continue
    if (input.keyword !== undefined && input.keyword !== '' && !display.toLowerCase().includes(input.keyword.toLowerCase())) continue
    if (input.skill !== undefined && input.skill !== '') {
      const lower = display.toLowerCase()
      const skill = input.skill.toLowerCase()
      if (!lower.includes(`/${skill}`) && !lower.includes(`forge:${skill}`)) continue
    }

    const existing = sessions.get(sessionId)
    if (existing === undefined) {
      sessions.set(sessionId, {
        sessionId,
        project,
        dateTime: '',
        msgCount: 1,
        firstMsg: display === '' ? '' : truncate(display, 80),
        maxMs: -1,
      })
    } else {
      existing.msgCount += 1
    }
    const target = sessions.get(sessionId)
    if (target === undefined) continue
    if (target.firstMsg === '' && display !== '') target.firstMsg = truncate(display, 80)
    const ts = typeof entry.timestamp === 'number' ? entry.timestamp : Number.NaN
    if (!Number.isNaN(ts)) {
      if (Number.isNaN(target.maxMs) || target.maxMs < 0) {
        target.maxMs = ts
        target.dateTime = formatMinute(ts)
      } else if (ts > target.maxMs) {
        target.maxMs = ts
        target.dateTime = formatMinute(ts)
      }
    }
  }

  const sorted = [...sessions.values()].sort((a, b) => (a.dateTime > b.dateTime ? -1 : a.dateTime < b.dateTime ? 1 : 0))
  const last = input.last === undefined || input.last <= 0 ? 20 : input.last
  return sorted.slice(0, last).map(({ sessionId, project, dateTime, msgCount, firstMsg }) => ({
    sessionId, project, dateTime, msgCount, firstMsg,
  }))
}

// ---------------------------------------------------------------------------
// extract(Go extract.go + helpers.go)
// ---------------------------------------------------------------------------

/** 会话 JSONL 行形状(Go jsonlEntry/jsonlMessage/contentBlock 同形,宽松读取)。 */
interface ContentBlock {
  type?: string
  thinking?: string
  text?: string
  name?: string
  id?: string
  tool_use_id?: string
  input?: unknown
}
interface RawJsonlEntry {
  type?: string
  message?: { id?: string; role?: string; content?: unknown; stop_reason?: string; model?: string }
  content?: string
  gitBranch?: string
  attachment?: Record<string, unknown>
  toolUseResult?: { type?: string; filePath?: string }
  timestamp?: string
  sessionId?: string
  snapshot?: { timestamp?: string }
}

/** message.content 数组块形态;textContent(Go textContent():首 text 块 → 原始串)。 */
function contentBlocksOf(content: unknown): ContentBlock[] {
  return Array.isArray(content) ? (content as ContentBlock[]) : []
}

function textContentOf(content: unknown): string {
  for (const block of contentBlocksOf(content)) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') return block.text
  }
  if (typeof content === 'string' && content !== '') return content
  return ''
}

/** Go detectSkills:'/forge:'、'<command-name>/ '、'<command-name>' 前缀扫描。 */
function detectSkills(content: string, skillsUsed: string[]): void {
  const lower = content.toLowerCase()
  for (const prefix of ['/forge:', '<command-name>/', '<command-name>']) {
    let searchFrom = 0
    for (;;) {
      const idx = lower.indexOf(prefix, searchFrom)
      if (idx === -1) break
      let end = idx + prefix.length
      while (end < lower.length && /[a-z0-9-_]/.test(lower[end] ?? '')) end += 1
      if (end > idx + prefix.length) {
        const name = lower.slice(idx + prefix.length, end)
        if (!skillsUsed.includes(name)) skillsUsed.push(name)
      }
      searchFrom = end
    }
  }
}

/** Go aggregateToolInput(Read/Edit/Write/Grep/Bash/Agent 输入面聚合)。 */
function aggregateToolInput(tool: string, input: unknown, summary: ForensicEvidenceSummary): void {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return
  const m = input as Record<string, unknown>
  const str = (key: string): string => (typeof m[key] === 'string' ? m[key] as string : '')
  switch (tool) {
    case 'Read':
      if (str('file_path') !== '') appendUniq(summary.filesRead, str('file_path'))
      break
    case 'Edit': case 'Write':
      if (str('file_path') !== '') appendUniq(summary.filesWritten, str('file_path'))
      break
    case 'Grep':
      if (str('pattern') !== '') appendUniq(summary.grepPatterns, str('pattern'))
      break
    case 'Bash':
      if (str('command') !== '') appendUniq(summary.commands, truncate(str('command'), 200))
      break
    case 'Agent': {
      const name = str('subagent_type') === '' ? 'unknown' : str('subagent_type')
      const found = summary.agentsSpawned.find(entry => entry.name === name)
      if (found !== undefined) found.count += 1
      else summary.agentsSpawned.push({ name, count: 1 })
      break
    }
    default:
      break
  }
}

function firstThinking(blocks: ContentBlock[]): string {
  for (const block of blocks) {
    if (block.type === 'thinking' && block.thinking !== '') return block.thinking
  }
  for (const block of blocks) {
    if (block.type === 'tool_use') return `${block.name ?? ''}(...)`
  }
  return ''
}

/** Go computeTimeRange(格式化 + 时长档位;不可解析 → 'first / last')。 */
function computeTimeRange(firstTS: string, lastTS: string, summary: ForensicEvidenceSummary): void {
  const firstMs = parseTimestampMs(firstTS)
  const lastMs = parseTimestampMs(lastTS)
  summary.startTime = firstTS === '' ? '' : Number.isNaN(firstMs) ? firstTS : formatSecond(firstMs)
  summary.endTime = lastTS === '' ? '' : Number.isNaN(lastMs) ? lastTS : formatSecond(lastMs)
  if (firstTS === '' || lastTS === '') return
  if (Number.isNaN(firstMs) || Number.isNaN(lastMs)) {
    summary.duration = `${firstTS} / ${lastTS}`
    return
  }
  const seconds = (lastMs - firstMs) / 1000
  if (seconds < 60) summary.duration = `${seconds.toFixed(0)}s`
  else if (seconds < 3600) summary.duration = `${(seconds / 60).toFixed(1)}min`
  else summary.duration = `${(seconds / 3600).toFixed(1)}h`
}

/** extract:transcript 不可读 → ERR_FORENSIC_SOURCE_UNREADABLE。 */
export function extractForensicEvidence(transcriptPath: string): ForensicEvidence {
  if (!existsSync(transcriptPath)) {
    throw unreadable('transcript', `${transcriptPath} does not exist`)
  }
  let raw: string
  try {
    raw = readFileSync(transcriptPath, 'utf8')
  } catch (error) {
    throw unreadable('transcript', String(error))
  }

  const result: ForensicEvidence = {
    file: transcriptPath,
    lines: 0,
    thinking: [],
    toolCalls: [],
    toolResults: [],
    userMsgs: [],
    skillsUsed: [],
    hooks: [],
    filesEdited: [],
    summary: {
      totalThinking: 0,
      totalToolCalls: 0,
      totalToolResults: 0,
      totalUserMsgs: 0,
      toolBreakdown: {},
      filesRead: [],
      filesWritten: [],
      grepPatterns: [],
      agentsSpawned: [],
      commands: [],
      hookBreakdown: [],
      hookFailures: 0,
      compactCount: 0,
      planModeCount: 0,
      stopReasons: {},
      skillInvocations: [],
      subagentCount: 0,
      startTime: '',
      endTime: '',
      duration: '',
      topSlowest: [],
      timingByTool: [],
      totalToolMs: 0,
      thinkingTurns: [],
      totalThinkingMs: 0,
    },
  }
  const pending = new Map<string, { ts: string; tool: string; line: number; detail: string }>()
  let firstTS = ''
  let lastTS = ''
  let prevTS = ''

  const entryTimestamp = (entry: RawJsonlEntry): string =>
    entry.timestamp ?? entry.snapshot?.timestamp ?? ''

  // 行语义对齐 Go bufio.Scanner:结尾换行不产生幽灵末行;中间空行仍计数。
  const lines = raw.endsWith('\n') ? raw.split(/\r?\n/).slice(0, -1) : raw.split(/\r?\n/)
  for (const line of lines) {
    result.lines += 1
    if (line.trim() === '') continue
    let entry: RawJsonlEntry
    try {
      entry = JSON.parse(line) as RawJsonlEntry
    } catch {
      continue
    }
    if (result.gitBranch === undefined && typeof entry.gitBranch === 'string' && entry.gitBranch !== '') {
      result.gitBranch = entry.gitBranch
    }

    const blocks = contentBlocksOf(entry.message?.content)
    if (entry.type === 'assistant') {
      for (const block of blocks) {
        if (block.type === 'thinking') {
          result.summary.totalThinking += 1
          result.thinking.push({
            line: result.lines,
            thinking: truncate(block.thinking ?? '', 500),
            stopReason: entry.message?.stop_reason || undefined,
            model: entry.message?.model || undefined,
            msgId: entry.message?.id || undefined,
          })
          if (result.model === undefined && entry.message?.model !== '') result.model = entry.message?.model
        } else if (block.type === 'tool_use') {
          result.summary.totalToolCalls += 1
          const tool = block.name ?? ''
          result.summary.toolBreakdown[tool] = (result.summary.toolBreakdown[tool] ?? 0) + 1
          const inputJSON = JSON.stringify(block.input ?? null) ?? ''
          result.toolCalls.push({
            line: result.lines,
            tool,
            input: truncate(inputJSON, 300),
            stopReason: entry.message?.stop_reason || undefined,
            msgId: entry.message?.id || undefined,
          })
          aggregateToolInput(tool, block.input, result.summary)
          if (block.id !== undefined && block.id !== '' && entry.timestamp !== undefined && entry.timestamp !== '') {
            pending.set(block.id, { ts: entry.timestamp, tool, line: result.lines, detail: truncate(inputJSON, 120) })
          }
        }
      }
      const stopReason = entry.message?.stop_reason
      if (stopReason !== undefined && stopReason !== '') {
        result.summary.stopReasons[stopReason] = (result.summary.stopReasons[stopReason] ?? 0) + 1
      }
      const entryTS = entryTimestamp(entry)
      if (entryTS !== '') {
        if (prevTS !== '') {
          const dur = durationMs(prevTS, entryTS)
          if (dur > 0) {
            result.summary.thinkingTurns.push({
              line: result.lines,
              seconds: dur / 1000,
              stopReason: entry.message?.stop_reason || undefined,
              detail: truncate(firstThinking(blocks), 80) || undefined,
            })
            result.summary.totalThinkingMs += dur
          }
        }
      }
    } else if (entry.type === 'user') {
      result.summary.totalUserMsgs += 1
      const content = entry.message?.role === 'user' ? textContentOf(entry.message?.content) || (entry.content ?? '') : ''
      if (content !== '') {
        result.userMsgs.push({ line: result.lines, content: truncate(content, 300), isMeta: false })
        detectSkills(content, result.skillsUsed)
      }
      for (const block of blocks) {
        if (block.type !== 'tool_result') continue
        const pendingCall = pending.get(block.tool_use_id ?? '')
        if (pendingCall !== undefined) {
          const dur = durationMs(pendingCall.ts, entry.timestamp ?? '')
          if (dur >= 0) {
            result.summary.totalToolMs += dur
            result.summary.topSlowest.push({
              tool: pendingCall.tool,
              line: pendingCall.line,
              seconds: dur / 1000,
              detail: pendingCall.detail,
            })
          }
          pending.delete(block.tool_use_id ?? '')
        }
        result.summary.totalToolResults += 1
        result.toolResults.push({
          line: result.lines,
          toolUseId: block.tool_use_id ?? '',
          resultType: entry.toolUseResult?.type || undefined,
          filePath: entry.toolUseResult?.filePath || undefined,
        })
      }
    } else if (entry.type === 'attachment') {
      const att = entry.attachment ?? {}
      const attType = typeof att.type === 'string' ? att.type : ''
      if (attType === 'invoked_skills') {
        for (const skill of Array.isArray(att.skills) ? att.skills : []) {
          const name = typeof (skill as { name?: unknown })?.name === 'string'
            ? ((skill as { name?: unknown }).name as string).toLowerCase().replace(/^forge:/, '')
            : ''
          if (name !== '' && !result.skillsUsed.includes(name)) result.skillsUsed.push(name)
        }
      } else if (attType === 'hook_success') {
        result.hooks.push({
          line: result.lines,
          hookName: typeof att.hookName === 'string' ? att.hookName : '',
          hookEvent: typeof att.hookEvent === 'string' ? att.hookEvent : '',
          durationMs: typeof att.durationMs === 'number' ? att.durationMs : 0,
          exitCode: typeof att.exitCode === 'number' ? att.exitCode : 0,
          command: typeof att.command === 'string' ? att.command : '',
        })
        addToAgg(result.summary.hookBreakdown, typeof att.hookName === 'string' ? att.hookName : '')
        if (typeof att.exitCode === 'number' && att.exitCode !== 0) result.summary.hookFailures += 1
      } else if (attType === 'edited_text_file') {
        if (typeof att.filename === 'string' && att.filename !== '') result.filesEdited.push(att.filename)
      } else if (attType === 'compact_file_reference') {
        result.summary.compactCount += 1
      } else if (attType === 'plan_mode' || attType === 'plan_mode_exit' || attType === 'plan_mode_reentry') {
        result.summary.planModeCount += 1
      }
      for (const skill of Array.isArray(att.skills) ? att.skills : []) {
        const name = typeof (skill as { name?: unknown })?.name === 'string' ? (skill as { name?: unknown }).name as string : ''
        if (name !== '') addToAgg(result.summary.skillInvocations, name)
      }
    }

    const entryTS = entryTimestamp(entry)
    if (entryTS !== '') {
      prevTS = entryTS
      if (firstTS === '') firstTS = entryTS
      lastTS = entryTS
    }
  }

  // Go aggregateTimings:TimingByTool 按 total 降序;TopSlowest 按秒降序取前 20。
  const byTool = new Map<string, TimingAgg>()
  for (const t of result.summary.topSlowest) {
    const agg = byTool.get(t.tool) ?? { tool: t.tool, count: 0, total: 0, average: 0, max: 0 }
    agg.count += 1
    agg.total += t.seconds
    if (t.seconds > agg.max) agg.max = t.seconds
    byTool.set(t.tool, agg)
  }
  for (const agg of byTool.values()) agg.average = agg.total / agg.count
  result.summary.timingByTool = [...byTool.values()].sort((a, b) => b.total - a.total)
  result.summary.topSlowest.sort((a, b) => b.seconds - a.seconds)
  if (result.summary.topSlowest.length > 20) result.summary.topSlowest = result.summary.topSlowest.slice(0, 20)
  result.summary.subagentCount = result.summary.agentsSpawned.reduce((sum, entry) => sum + entry.count, 0)
  computeTimeRange(firstTS, lastTS, result.summary)
  return result
}

// ---------------------------------------------------------------------------
// subagents(Go subagents.go)
// ---------------------------------------------------------------------------

/** subagents 目录缺失/不可读 → ERR_FORENSIC_SOURCE_UNREADABLE(Go 同口径)。 */
export function listForensicSubagents(sessionDir: string): ForensicSubagent[] {
  const subDir = join(sessionDir, 'subagents')
  let names: string[]
  try {
    names = readdirSync(subDir)
  } catch (error) {
    throw unreadable('subagents directory', String(error))
  }
  const agents: ForensicSubagent[] = []
  for (const name of names) {
    if (!name.endsWith('.meta.json')) continue
    let meta: Record<string, unknown> = {}
    try {
      meta = JSON.parse(readFileSync(join(subDir, name), 'utf8')) as Record<string, unknown>
    } catch {
      meta = {} // Go:_ = json.Unmarshal(损坏 → 空元数据,条目仍列出)
    }
    const base = name.slice(0, -'.meta.json'.length)
    agents.push({
      agentId: base.startsWith('agent-') ? base.slice('agent-'.length) : base,
      agentType: typeof meta.agentType === 'string' ? meta.agentType : '',
      transcript: join(subDir, `${base}.jsonl`),
    })
  }
  return agents
}
