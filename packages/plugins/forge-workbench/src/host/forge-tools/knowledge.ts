// host/forge-tools/knowledge — forge 知识系工具族(任务 2.2;D4 数据面先行)。
//
// tech-design §Interface 2「forge.fact / lesson / research / forensic」的
// 落地形态:扁平名四工具(spike-1 §1.2 点号名回填;plugin_manager 先例 =
// 单工具 + action 枚举),经 2.1 基座(renderer 桥)路由到内核知识系动词:
//
//   forge_fact     action = list/get/summary(读)+ add(写;.forge/fact-table.json)
//   forge_lesson   action = list/get(读)+ add(写;文档根 docs/lessons/)
//   forge_research action = list/get(读)+ add(写;文档根 docs/research/)
//   forge_forensic action = search/extract/subagents(全只读;机器全局源)
//
// 读写语义 = forge CLI 对应命令数据面(fact list/get/summary · lesson ·
// research · forensic search/extract/subagents;文件布局/条目形态逐字段
// 对齐,移植基准 forge-cli pkg/facttable · pkg/infocmd · internal/cmd/forensic)。
// add 写腿为 D4「必要写」(技能 M4 后迁,数据面先兑现已注册项目零 CLI)。
//
// 工具面防线(T1 缓解 + Hard Rule 越界拒绝):name/slug 段形态在桥前白名单
// 断言(镜像内核 knowledge-error 同规则,双闸);写动作经 actorOf 会话标识
// fail-closed(审计纪律;forge 文件数据面无作者槽,actor 随帧走不落盘)。
// 结果语义与任务族一致(executeVia):内核值/业务拒绝 = canonical JSON 值;
// transport 失败 = ERR_TOOL_BRIDGE_UNAVAILABLE throw 上抛(Story 9 禁静默)。

import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ForgeToolBridgeVerb } from './bridge-core'
import { executeVia, TOOL_OUTPUT_SCHEMA, type ForgeTaskToolCallFn } from './task-tools'

/** 注入面(桥调用直通 + 测试 seam)。 */
export interface ForgeKnowledgeToolDeps {
  readonly call: ForgeTaskToolCallFn
}

/** 地址段判定(镜像内核 knowledge-error.isKnowledgeSegment / task 族 isSegment)。 */
function isSegment(segment: string): boolean {
  if (segment === '') return false
  for (const ch of segment) {
    const code = ch.codePointAt(0)
    if (code === undefined) return false
    if (code <= 0x1f || code === 0x7f) return false
    if (ch === '/' || ch === '\\') return false
  }
  return true
}

const OUTPUT = {
  schema: TOOL_OUTPUT_SCHEMA,
  render: (_args: unknown, value: string): Array<{ type: 'text'; text: string }> => [{ type: 'text', text: value }],
}

/** 桥前业务拒绝载荷(ok:false + code;与内核同码,值形态非 throw)。 */
function reject(code: string, message: string): string {
  return JSON.stringify({ ok: false, code, message })
}

/** 知识系工具族(4 个扁平名工具;后续族经同一基座追加,不另设通道)。 */
export function createForgeKnowledgeTools(deps: ForgeKnowledgeToolDeps): ToolDefinition[] {
  const { call } = deps
  const via = (verb: ForgeToolBridgeVerb, args: Record<string, unknown>, exec: ToolRunContext) =>
    executeVia(call, verb, args, exec)

  const FACT_ACTIONS = ['list', 'get', 'summary', 'add'] as const
  const FACT_SOURCES = ['static', 'runtime', 'manual'] as const
  const FACT_CONFIDENCES = ['confirmed', 'inferred', 'assumed'] as const
  const FACT_KINDS = [
    'signature', 'output_format', 'error_code', 'side_effect',
    'precondition', 'compilation_error', 'runtime_crash',
  ] as const

  return [
    defineTool({
      name: 'forge_fact',
      description: 'Manage the project Fact Table (.forge/fact-table.json, the forge CLI data plane): list filtered by source/confidence, get one entry by fact_id, or summary stats grouped by source/confidence/kind. action=add appends a validated fact (append-only; fact_id auto-mints <subject>.<kind>-<nonce> when omitted) — the write lands only inside the .forge root of the registered project. Unregistered projects answer ERR_PROJECT_NOT_FOUND.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        action: { type: 'string', required: true, enum: FACT_ACTIONS, description: 'list / get / summary (read) or add (write).' },
        source: { type: 'string', enum: FACT_SOURCES, description: 'list filter: static / runtime / manual.' },
        confidence: { type: 'string', enum: FACT_CONFIDENCES, description: 'list filter: confirmed / inferred / assumed.' },
        factId: { type: 'string', description: 'get: the fact_id to read.' },
        entry: { type: 'object', additionalProperties: true, description: 'add draft: { factId?, source?, subject, kind, value, confidence? } (source default manual, confidence default inferred; validated here and re-validated in the kernel).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        if (args.action === 'get' && (args.factId === undefined || args.factId === '')) {
          return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'factId is required for action=get')
        }
        if (args.action === 'add') {
          const entry = args.entry
          if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'entry is required for action=add (object: subject, kind, value)')
          }
          const draft = entry as { subject?: unknown; kind?: unknown; value?: unknown; factId?: unknown }
          if (typeof draft.subject !== 'string' || draft.subject === '') {
            return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'entry.subject must be a non-empty string')
          }
          if (typeof draft.kind !== 'string' || !(FACT_KINDS as readonly string[]).includes(draft.kind)) {
            return reject('ERR_KNOWLEDGE_INPUT_INVALID', `entry.kind must be one of ${FACT_KINDS.join('/')} (got ${JSON.stringify(draft.kind)})`)
          }
          if (draft.value === undefined || draft.value === null) {
            return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'entry.value is required (any JSON value)')
          }
        }
        return via('knowledge_fact', { ...args }, exec)
      },
    }),
    defineTool({
      name: 'forge_lesson',
      description: 'Read or append project lessons (docs/lessons/*.md, the forge CLI data plane): list newest-first (frontmatter created, mtime fallback; category inferred from the name prefix gotcha-/arch-/pattern-/tool-/lesson-/hook-), or get one by name. action=add writes a new lesson markdown (frontmatter created/tags/title/severity + body; created defaults to today) — append-only, lands only inside the doc root of the registered project; existing names answer ERR_KNOWLEDGE_ENTRY_EXISTS.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        action: { type: 'string', required: true, enum: ['list', 'get', 'add'], description: 'list / get (read) or add (write).' },
        name: { type: 'string', description: 'get/add target lesson name (file name without .md; single path segment).' },
        title: { type: 'string', description: 'add: frontmatter title.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'add: frontmatter tags.' },
        severity: { type: 'string', description: 'add: frontmatter severity.' },
        created: { type: 'string', description: 'add: frontmatter created date (YYYY-MM-DD; default today).' },
        body: { type: 'string', description: 'add: lesson markdown body (after the frontmatter).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        if ((args.action === 'get' || args.action === 'add') && (args.name === undefined || args.name === '')) {
          return reject('ERR_KNOWLEDGE_INPUT_INVALID', `name is required for action=${args.action}`)
        }
        if (args.action === 'add') {
          if (args.name !== undefined && !isSegment(args.name)) {
            return reject('ERR_KNOWLEDGE_PATH_INVALID', `lesson name ${JSON.stringify(args.name)} must be a single non-empty path segment (no '/', no path separators or control characters)`)
          }
          if (args.body === undefined || args.body.trim() === '') {
            return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'body is required for action=add')
          }
        }
        return via('knowledge_lesson', { ...args }, exec)
      },
    }),
    defineTool({
      name: 'forge_research',
      description: 'Read or append research reports (docs/research/*.md, the forge CLI data plane): list newest-first (frontmatter created, mtime fallback) or get one by slug. action=add writes a new report markdown (frontmatter created/topic/mode/dimensions/candidates + body; created defaults to today) — append-only, lands only inside the doc root of the registered project; existing slugs answer ERR_KNOWLEDGE_ENTRY_EXISTS.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        action: { type: 'string', required: true, enum: ['list', 'get', 'add'], description: 'list / get (read) or add (write).' },
        slug: { type: 'string', description: 'get/add target report slug (file name without .md; single path segment).' },
        topic: { type: 'string', description: 'add: frontmatter topic.' },
        mode: { type: 'string', description: 'add: frontmatter mode (e.g. single-tech-deep-dive / candidate-comparison).' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'add: frontmatter dimensions.' },
        candidates: { type: 'array', items: { type: 'string' }, description: 'add: frontmatter candidates.' },
        created: { type: 'string', description: 'add: frontmatter created date (YYYY-MM-DD; default today).' },
        body: { type: 'string', description: 'add: report markdown body (after the frontmatter).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        if ((args.action === 'get' || args.action === 'add') && (args.slug === undefined || args.slug === '')) {
          return reject('ERR_KNOWLEDGE_INPUT_INVALID', `slug is required for action=${args.action}`)
        }
        if (args.action === 'add') {
          if (args.slug !== undefined && !isSegment(args.slug)) {
            return reject('ERR_KNOWLEDGE_PATH_INVALID', `research slug ${JSON.stringify(args.slug)} must be a single non-empty path segment (no '/', no path separators or control characters)`)
          }
          if (args.body === undefined || args.body.trim() === '') {
            return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'body is required for action=add')
          }
        }
        return via('knowledge_research', { ...args }, exec)
      },
    }),
    defineTool({
      name: 'forge_forensic',
      description: 'Read-only session-transcript forensics (the forge CLI data plane, machine-global — no project registration): search ~/.claude/history.jsonl for sessions (filter by project path substring, session-id prefix, keyword, or skill name; newest first, capped by last), extract compact evidence from a session JSONL (thinking/tool chains, hooks, file edits, timing aggregates — returned as a value, nothing is written), or list subagent transcripts for a session directory. Unreadable sources answer ERR_FORENSIC_SOURCE_UNREADABLE.',
      parameters: {
        action: { type: 'string', required: true, enum: ['search', 'extract', 'subagents'], description: 'search (history.jsonl) / extract (transcript JSONL) / subagents (session dir).' },
        projectPath: { type: 'string', description: 'search: project path substring filter.' },
        keyword: { type: 'string', description: 'search: keyword in user messages (case-insensitive).' },
        session: { type: 'string', description: 'search: session id prefix filter.' },
        skill: { type: 'string', description: 'search: skill name invoked in session.' },
        last: { type: 'integer', description: 'search: result limit (default 20).' },
        transcriptPath: { type: 'string', description: 'extract: absolute path to the session JSONL transcript.' },
        sessionDir: { type: 'string', description: 'subagents: session directory path (subagents/ inside).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        if (args.action === 'extract' && (args.transcriptPath === undefined || args.transcriptPath === '')) {
          return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'transcriptPath is required for action=extract')
        }
        if (args.action === 'subagents' && (args.sessionDir === undefined || args.sessionDir === '')) {
          return reject('ERR_KNOWLEDGE_INPUT_INVALID', 'sessionDir is required for action=subagents')
        }
        return via('knowledge_forensic', { ...args }, exec)
      },
    }),
  ]
}
