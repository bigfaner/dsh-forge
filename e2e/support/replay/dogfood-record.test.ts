// 5.4 dogfood 录制器单测（vitest e2e-support 池——纯逻辑面；真实模型走查 = e2e spec）。
// 覆盖：① buildDogfoodFixture 全链重建（verb/observed/event 三类行 + fix 链 restored +
// 重入 digest 校验）；② 完整性 fail-loud（digest 缺席/全文指纹失配）；③ 会话文件
// dispatchPrompt 全文抽取（tool/result render 标记行）；④ 种行器（受控初态——相位号
// localId 直写，addTask 数值顺延不可达面）。
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { seedFeature } from '../../../packages/core/src/forge/tasks/harness.js'
import {
  buildDogfoodFixture,
  extractBriefTexts,
  seedDogfoodTaskRow,
  type DogfoodAuditRecord,
  type DogfoodEdgeRow,
  type DogfoodTaskRow,
} from './dogfood-record.js'
import { loadFixture, writeFixture } from './fixtures.js'
import type { ReplayObservedStep, ReplayVerbStep } from './format.js'
import type { SessionEvent } from '../session-files.js'

/** 类型收窄谓词（kind 判别——filter 不自动窄化） */
const isVerb = (s: { kind: string }): s is ReplayVerbStep => s.kind === 'verb'
const isObserved = (s: { kind: string }): s is ReplayObservedStep => s.kind === 'observed'

/** verb 行目标自然键（claim/submit 的 taskRef.localId；addTask = 'new'） */
const refOf = (v: ReplayVerbStep): string => (v.args.taskRef as { localId?: string } | undefined)?.localId ?? 'new'

/** 简文指纹（digest.ts 同式——sha256 前 12 hex；测试内独立计算，不 import core 内部位） */
function digestOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)
}

// ─── 合成审计：A 成功径 + B fix 链 + C 中断重入 + 兄弟 S 供相位变化 ───

const PROJECT = 'proj-dogfood-unit'

function task(
  id: string,
  localId: string,
  extra: Partial<DogfoodTaskRow> = {},
): DogfoodTaskRow {
  return {
    id,
    slug: 'dogfood-demo',
    localId,
    title: `任务 ${localId}`,
    taskType: 'doc',
    priority: null,
    taskDesc: null,
    varsJson: null,
    sourceTaskId: null,
    createdAt: '2026-10-06T10:00:00.000Z',
    ...extra,
  }
}

const T_A = task('t-a', '1.1', { priority: 'P0' })
const T_B = task('t-b', '2.1', { priority: 'P1' })
const T_C = task('t-c', '3.1', { priority: 'P1' })
const T_S = task('t-s', '3.2', { priority: 'P2' })
const T_FIX = task('t-fix', 'fix-1', {
  sourceTaskId: 't-b',
  taskDesc: 'Fix: target.md absent — create target.md with the single line: marker',
  varsJson: '{"SOURCE_FILES":"target.md"}',
})

let seq = 0
function rec(
  taskId: string,
  verb: DogfoodAuditRecord['verb'],
  o: Partial<DogfoodAuditRecord> = {},
): DogfoodAuditRecord {
  return {
    id: ++seq,
    taskId,
    slug: 'dogfood-demo',
    localId: '',
    verb,
    fromStatus: null,
    toStatus: null,
    reason: null,
    summary: null,
    filesJson: null,
    gateJson: null,
    commitHash: null,
    dispatchDigest: null,
    actor: 'plugin-tool',
    sessionId: null,
    createdAt: new Date(Date.UTC(2026, 9, 6, 10, 0, seq)).toISOString(),
    ...o,
  }
}

const BRIEF_A1 = 'brief-A-first'
const BRIEF_B1 = 'brief-B-first'
const BRIEF_B2 = 'brief-B-second-with-BLOCKERS'
const BRIEF_C1 = 'brief-C-first-with-PHASE_SUMMARY'
const BRIEF_C2 = 'brief-C-second'
const BRIEF_S = 'brief-S'
const BRIEF_F = 'brief-F-fix'

/** 记录序列（id 升序 = 追加序）：A 成功 → B 受阻+建链 → C 中断（S 兄弟中途结算）→ C 重入成功 → fix 完成+恢复 → B 二轮成功 */
function auditRecords(): DogfoodAuditRecord[] {
  seq = 0
  return [
    rec('t-a', 'claim', { localId: '1.1', fromStatus: 'pending', toStatus: 'in_progress', dispatchDigest: digestOf(BRIEF_A1), sessionId: 'session-disp' }),
    rec('t-a', 'submit', { localId: '1.1', toStatus: 'completed', summary: 'A 完成', filesJson: '["notes.md"]', gateJson: '{"compile":true,"fmt":true,"lint":true,"test":true}', commitHash: 'abc123def', sessionId: 'exec-a' }),
    rec('t-b', 'claim', { localId: '2.1', fromStatus: 'pending', toStatus: 'in_progress', dispatchDigest: digestOf(BRIEF_B1), sessionId: 'session-disp' }),
    rec('t-b', 'submit', { localId: '2.1', toStatus: 'blocked', reason: 'target.md absent — fix: create target.md with the single line: marker', sessionId: 'exec-b' }),
    rec('t-fix', 'add', { localId: 'fix-1' }),
    rec('t-b', 'auto-block', { localId: '2.1', fromStatus: 'blocked', toStatus: 'blocked', actor: 'core' }),
    rec('t-c', 'claim', { localId: '3.1', fromStatus: 'pending', toStatus: 'in_progress', dispatchDigest: digestOf(BRIEF_C1), sessionId: 'session-disp' }),
    rec('t-s', 'claim', { localId: '3.2', fromStatus: 'pending', toStatus: 'in_progress', dispatchDigest: digestOf(BRIEF_S), sessionId: 'e2e-harness' }),
    rec('t-s', 'submit', { localId: '3.2', toStatus: 'completed', summary: 'harness 结算兄弟任务', sessionId: 'e2e-harness' }),
    rec('t-c', 'claim', { localId: '3.1', fromStatus: null, toStatus: null, dispatchDigest: digestOf(BRIEF_C2), sessionId: 'session-disp' }),
    rec('t-c', 'submit', { localId: '3.1', toStatus: 'completed', summary: 'C 恢复结算', filesJson: '["interrupt.md"]', gateJson: '{"compile":true,"fmt":true,"lint":true,"test":true}', sessionId: 'exec-c2' }),
    rec('t-fix', 'claim', { localId: 'fix-1', fromStatus: 'pending', toStatus: 'in_progress', dispatchDigest: digestOf(BRIEF_F), sessionId: 'session-disp' }),
    rec('t-fix', 'submit', { localId: 'fix-1', toStatus: 'completed', summary: 'fix 完成', filesJson: '["target.md"]', gateJson: '{"compile":true,"fmt":true,"lint":true,"test":true}', commitHash: 'fff000', sessionId: 'exec-fix', createdAt: '2026-10-06T10:00:13.000Z' }),
    rec('t-b', 'auto-restore', { localId: '2.1', fromStatus: 'blocked', toStatus: 'pending', actor: 'core', createdAt: '2026-10-06T10:00:13.000Z' }),
    rec('t-b', 'claim', { localId: '2.1', fromStatus: 'pending', toStatus: 'in_progress', dispatchDigest: digestOf(BRIEF_B2), sessionId: 'session-disp' }),
    rec('t-b', 'submit', { localId: '2.1', toStatus: 'completed', summary: 'B 二轮完成', filesJson: '["target.md"]', gateJson: '{"compile":true,"fmt":true,"lint":true,"test":true}', sessionId: 'exec-b2' }),
  ]
}

function briefTexts(): Map<string, string> {
  return new Map(
    [BRIEF_A1, BRIEF_B1, BRIEF_B2, BRIEF_C1, BRIEF_C2, BRIEF_S, BRIEF_F].map((t) => [digestOf(t), t]),
  )
}

const EDGES: DogfoodEdgeRow[] = [{ taskId: 't-b', prerequisiteId: 't-fix', origin: 'fix-chain' }]

const EVENTS = [
  { at: 1, payload: { projectId: PROJECT } },
  { at: 2, payload: { projectId: PROJECT } },
  { at: 3, payload: { projectId: PROJECT } },
]

describe('5.4 buildDogfoodFixture：审计重建三类行', () => {
  it('全链：verb 行依审计序 + observed 承载简报全文与 restored + event 行 + header source=dogfood', () => {
    const fx = buildDogfoodFixture({
      projectId: PROJECT,
      tasks: [T_A, T_B, T_C, T_S, T_FIX],
      edges: EDGES,
      records: auditRecords(),
      briefTexts: briefTexts(),
      harnessCalls: [],
      events: EVENTS,
      meta: { note: 'unit' },
    })
    expect(fx.header.source).toBe('dogfood')
    const verbs = fx.steps.filter(isVerb)
    // add(1) + claim(7) + submit(6) = 14 verb 行（auto-block/auto-restore = core 效果不入 verb 面）
    expect(verbs.map((v) => `${v.verb}:${refOf(v)}`)).toEqual([
      'claimTask:1.1', 'submitTask:1.1',
      'claimTask:2.1', 'submitTask:2.1',
      'addTask:new',
      'claimTask:3.1', 'claimTask:3.2', 'submitTask:3.2', 'claimTask:3.1', 'submitTask:3.1',
      'claimTask:fix-1', 'submitTask:fix-1',
      'claimTask:2.1', 'submitTask:2.1',
    ])
    // fix addTask 行：block_source 数据面（sourceRef + blockSource + vars + desc）
    const addArgs = verbs.find((v) => v.verb === 'addTask')!.args as Record<string, unknown>
    expect(addArgs).toMatchObject({
      projectId: PROJECT, featureSlug: 'dogfood-demo', type: 'doc',
      sourceTask: { slug: 'dogfood-demo', localId: '2.1' }, blockSource: true,
      vars: { SOURCE_FILES: 'target.md' },
    })
    // observed：首 claim 全文 + digest + reclaimed=false；重入 claim reclaimed=true
    const observed = fx.steps.filter(isObserved)
    const claimObs = observed.filter((o) => o.verb === 'claimTask')
    expect(claimObs).toHaveLength(7)
    const first = claimObs[0]!.result as { dispatchPrompt: string; digest: string; reclaimed: boolean; task: { localId: string } }
    expect(first.dispatchPrompt).toBe(BRIEF_A1)
    expect(first.digest).toBe(digestOf(BRIEF_A1))
    expect(first.reclaimed).toBe(false)
    const reclaim = claimObs.find((o) => (o.result as { task?: { localId?: string } }).task?.localId === '3.1' && (o.result as { reclaimed: boolean }).reclaimed === true)
    expect(reclaim, '3.1 重入行 reclaimed=true 在场').toBeDefined()
    expect((reclaim!.result as { dispatchPrompt: string }).dispatchPrompt).toBe(BRIEF_C2)
    // submit observed：fix 结算 restored=['slug/2.1']；其余 restored=[]
    const submitObs = observed.filter((o) => o.verb === 'submitTask')
    expect(submitObs).toHaveLength(6)
    const fixSubmit = submitObs.find((o) => (o.result as { status: string }).status === 'completed' && ((o.result as { restored: unknown[] }).restored?.length ?? 0) > 0)
    expect(fixSubmit, 'fix 结算 restored 非空在场').toBeDefined()
    expect((fixSubmit!.result as { restored: { slug: string; localId: string }[] }).restored).toEqual([{ slug: 'dogfood-demo', localId: '2.1' }])
    // event 行：全部 tasks-changed + projectId 同源
    const eventSteps = fx.steps.filter((s) => s.kind === 'event')
    expect(eventSteps).toHaveLength(3)
    expect(eventSteps.every((e) => e.channel === 'forge:events/tasks-changed' && e.payload.projectId === PROJECT)).toBe(true)
    // seq 单列单调
    const seqs = fx.steps.map((s) => s.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })

  it('harness 桥调用：claim 简报全文并入 digest 面（审计行缺会话抽取时的补给）且不重复入列', () => {
    const base = auditRecords()
    const records = base.filter((r) => r.taskId !== 't-s') // 剥掉 t-s 审计行后经 harnessCalls 补全文
    const texts = briefTexts()
    texts.delete(digestOf(BRIEF_S))
    const harnessAt = Date.parse(base.find((r) => r.taskId === 't-s' && r.verb === 'claim')!.createdAt)
    const fx = buildDogfoodFixture({
      projectId: PROJECT,
      tasks: [T_A, T_B, T_C, T_S, T_FIX],
      edges: EDGES,
      records,
      briefTexts: texts,
      harnessCalls: [
        {
          service: 'forgeTasks' as const,
          verb: 'claimTask' as const,
          at: harnessAt,
          args: { projectId: PROJECT, taskRef: { slug: 'dogfood-demo', localId: '3.2' }, sessionId: 'e2e-harness' },
          result: { task: { taskId: 't-s', slug: 'dogfood-demo', localId: '3.2', taskStatus: 'in_progress' }, dispatchPrompt: BRIEF_S, digest: digestOf(BRIEF_S), reclaimed: false },
        },
      ],
      events: EVENTS,
    })
    // 不重复入列：harnessCalls 不产 verb/observed 行（其审计行承载——此处已剥除故零行）
    const verbs = fx.steps.filter(isVerb)
    expect(verbs.some((v) => v.verb === 'claimTask' && refOf(v) === '3.2')).toBe(false)
    expect(verbs.some((v) => v.verb === 'submitTask' && refOf(v) === '3.2')).toBe(false)
  })

  it('fail-loud：claim digest 缺简报全文 → 带缺失 digest 的错误', () => {
    const texts = briefTexts()
    texts.delete(digestOf(BRIEF_C2))
    expect(() =>
      buildDogfoodFixture({ projectId: PROJECT, tasks: [T_A, T_B, T_C, T_S, T_FIX], edges: EDGES, records: auditRecords(), briefTexts: texts, harnessCalls: [], events: EVENTS }),
    ).toThrowError(new RegExp(`3\\.1.*${digestOf(BRIEF_C2)}`))
  })

  it('fail-loud：简报全文指纹失配（digest ≠ sha256 前 12）', () => {
    const texts = new Map([[digestOf(BRIEF_A1), 'tampered-text']])
    expect(() =>
      buildDogfoodFixture({ projectId: PROJECT, tasks: [T_A], edges: [], records: auditRecords().slice(0, 1), briefTexts: texts, harnessCalls: [], events: [] }),
    ).toThrowError(/指纹失配/)
  })

  it('落盘往返：writeFixture → loadFixture 解析同构（5.1 格式自证）', () => {
    const fx = buildDogfoodFixture({
      projectId: PROJECT, tasks: [T_A, T_B, T_C, T_S, T_FIX], edges: EDGES,
      records: auditRecords(), briefTexts: briefTexts(), harnessCalls: [], events: EVENTS, meta: { note: 'roundtrip' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-dogfood-rec-'))
    const path = join(dir, 'fx.jsonl')
    try {
      writeFixture(path, fx)
      const loaded = loadFixture(path)
      expect(loaded.steps).toEqual(fx.steps)
      expect(loaded.header.note).toBe('roundtrip')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('5.4 extractBriefTexts：会话文件 tool/result 全文抽取', () => {
  const MARKER = 'Dispatch brief — hand to the executor verbatim:\n'

  function toolResult(texts: readonly string[], callId = 'call_1'): SessionEvent {
    return {
      type: 'tool/result',
      seq: 2,
      data: { message: { content: texts.map((t) => ({ type: 'text', text: t })) }, toolCallId: callId },
    } as SessionEvent
  }

  it('render 标记行后取全文 → digest 键 Map；Z1 空结果/他工具忽略', () => {
    const events: SessionEvent[] = [
      { type: 'system/message', seq: 1, data: { message: { content: [{ type: 'text', text: 'system prompt' }] } } },
      { type: 'tool/call', seq: 2, data: { name: 'claimTask', arguments: '{}' } },
      toolResult([`Task claimed: dogfood-demo/1.1 [in_progress] 任务 1.1 (type doc)\n${MARKER}${BRIEF_A1}`]),
      toolResult(['No ready task in this workspace (nothing to claim) — wait for prerequisites to finish or finish the session.'], 'call_2'),
      { type: 'tool/call', seq: 5, data: { name: 'queryTask', arguments: '{}' } },
      toolResult(['Task queried: something'], 'call_3'),
      toolResult([`Task claimed: dogfood-demo/3.1 [in_progress]\n(re-entry of an in-progress task — previous run did not submit; brief re-synthesized)\n${MARKER}${BRIEF_C2}`], 'call_4'),
    ]
    const texts = extractBriefTexts(events)
    expect(texts.get(digestOf(BRIEF_A1))).toBe(BRIEF_A1)
    expect(texts.get(digestOf(BRIEF_C2))).toBe(BRIEF_C2)
    expect(texts.size).toBe(2)
  })
})

describe('5.4 seedDogfoodTaskRow：受控初态种行（相位号 localId 直写）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-dogfood-seed-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('全字段落行（title/desc/priority/type）+ slug ≡ feature 不变量沿袭', async () => {
    const { openForgeDbAt } = await import('./db-insert.js')
    const db = openForgeDbAt(dir)
    try {
      seedFeature(db, { slug: 'dogfood-demo', status: 'tasks' })
      seedDogfoodTaskRow(db, 'dogfood-demo', '3.1', {
        title: '中断恢复演练',
        taskType: 'doc',
        priority: 'P1',
        taskDesc: '创建 interrupt.md 后不提交（模拟中断）',
      })
      const row = db
        .prepare<unknown[], { local_id: string; title: string; task_type: string; priority: string; task_desc: string; task_status: string }>(
          'SELECT local_id, title, task_type, priority, task_desc, task_status FROM tasks WHERE slug = ? AND local_id = ?',
        )
        .get('dogfood-demo', '3.1')
      expect(row).toMatchObject({
        local_id: '3.1', title: '中断恢复演练', task_type: 'doc',
        priority: 'P1', task_desc: '创建 interrupt.md 后不提交（模拟中断）', task_status: 'pending',
      })
    } finally {
      db.close()
    }
  })
})
