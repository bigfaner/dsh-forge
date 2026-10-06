// 5.1 JSONL 夹具格式单测（AC3）：版本字段预留（v 逐行在场 + 不兼容版本 fail-loud）+
// 四类记录（header/verb/observed/event）序列化-解析往返 + 文档级解析纪律（首行 header、
// 观测行不执行由 executor 测试承载）。claim 返回 dispatchPrompt 全文 = observed 行载荷面。
import { describe, expect, it } from 'vitest'
import {
  parseReplayDocument,
  parseReplayLine,
  REPLAY_FORMAT,
  REPLAY_VERSION,
  ReplayFormatError,
  toReplayLine,
  type ReplayRecord,
} from './format.js'

describe('5.1 format · 单行解析与序列化往返', () => {
  it('header 行往返', () => {
    const line = toReplayLine({
      v: REPLAY_VERSION,
      kind: 'header',
      format: REPLAY_FORMAT,
      recordedAt: '2026-10-06T00:00:00.000Z',
      source: 'hand',
      note: '自证',
    })
    const parsed = parseReplayLine(line, 1)
    expect(parsed).toEqual({
      v: 1,
      kind: 'header',
      format: 'dsh-forge-replay',
      recordedAt: '2026-10-06T00:00:00.000Z',
      source: 'hand',
      note: '自证',
    })
  })

  it('verb 行往返（动词调用序列——回放执行面）', () => {
    const step: ReplayRecord = {
      v: REPLAY_VERSION,
      kind: 'verb',
      seq: 1,
      service: 'forgeTasks',
      verb: 'addTask',
      args: { projectId: 'p-1', featureSlug: 'demo', title: '任务甲', type: 'coding-feature', dependsOn: [] },
    }
    const parsed = parseReplayLine(toReplayLine(step), 3)
    expect(parsed).toEqual(step)
  })

  it('observed 行往返（claim 返回 dispatchPrompt 全文承载面）', () => {
    const step: ReplayRecord = {
      v: REPLAY_VERSION,
      kind: 'observed',
      seq: 2,
      service: 'forgeTasks',
      verb: 'claimTask',
      result: {
        task: { taskId: 't-1', slug: 'demo', localId: '1' },
        dispatchPrompt: '你是任务执行者……\n<constraints>质量门序列……</constraints>\n<task-context>TASK_ID: demo/1</task-context>\n<type-policy>coding-feature 模板</type-policy>',
        digest: '0123456789ab',
        reclaimed: false,
      },
      at: '2026-10-06T00:00:01.000Z',
    }
    expect(parseReplayLine(toReplayLine(step), 4)).toEqual(step)
  })

  it('event 行往返（fix 链事件流——tasks-changed 推送记账）', () => {
    const step: ReplayRecord = {
      v: REPLAY_VERSION,
      kind: 'event',
      seq: 3,
      channel: 'forge:events/tasks-changed',
      payload: { projectId: 'p-1' },
    }
    expect(parseReplayLine(toReplayLine(step), 5)).toEqual(step)
  })

  it('版本字段预留：v 恒为行首键（机械序——版本策略演化的解析锚）', () => {
    const line = toReplayLine({ v: REPLAY_VERSION, kind: 'header', format: REPLAY_FORMAT, recordedAt: '2026-10-06T00:00:00.000Z' })
    const keys = Object.keys(JSON.parse(line) as Record<string, unknown>)
    expect(keys[0]).toBe('v')
    expect(keys[1]).toBe('kind')
  })
})

describe('5.1 format · 单行解析纪律（fail-loud + 行号定位）', () => {
  it('非 JSON 行 → ReplayFormatError（带行号）', () => {
    expect(() => parseReplayLine('not-json{', 7)).toThrow(ReplayFormatError)
    try {
      parseReplayLine('not-json{', 7)
    } catch (e) {
      expect((e as Error).message).toContain('第 7 行')
    }
  })

  it('版本不兼容（v≠REPLAY_VERSION）→ 明确版本口径（Open Question 版本策略——首录后定）', () => {
    expect(() => parseReplayLine(JSON.stringify({ v: 2, kind: 'verb', seq: 1, service: 'forgeTasks', verb: 'addTask', args: {} }), 2)).toThrow(
      /版本/,
    )
    expect(() => parseReplayLine(JSON.stringify({ v: 0, kind: 'header', format: REPLAY_FORMAT, recordedAt: 'x' }), 1)).toThrow(/版本/)
  })

  it('verb 行形状违例：未知 service / 未知动词 / args 非对象 / seq 缺席 → 拒绝', () => {
    expect(() => parseReplayLine(JSON.stringify({ v: 1, kind: 'verb', seq: 1, service: 'forgeProjects', verb: 'addTask', args: {} }), 1)).toThrow(ReplayFormatError)
    expect(() => parseReplayLine(JSON.stringify({ v: 1, kind: 'verb', seq: 1, service: 'forgeTasks', verb: 'transitionTask', args: {} }), 1)).toThrow(/transitionTask/)
    expect(() => parseReplayLine(JSON.stringify({ v: 1, kind: 'verb', seq: 1, service: 'forgeTasks', verb: 'addTask', args: [1, 2] }), 1)).toThrow(ReplayFormatError)
    expect(() => parseReplayLine(JSON.stringify({ v: 1, kind: 'verb', service: 'forgeTasks', verb: 'addTask', args: {} }), 1)).toThrow(ReplayFormatError)
  })

  it('未知 kind → 拒绝', () => {
    expect(() => parseReplayLine(JSON.stringify({ v: 1, kind: 'mystery' }), 1)).toThrow(/kind/)
  })
})

describe('5.1 format · 文档级解析（parseReplayDocument）', () => {
  const doc = [
    toReplayLine({ v: 1, kind: 'header', format: REPLAY_FORMAT, recordedAt: '2026-10-06T00:00:00.000Z', source: 'hand' }),
    toReplayLine({ v: 1, kind: 'verb', seq: 1, service: 'forgeProposals', verb: 'createProposal', args: { projectId: 'p', slug: 'pr', title: '提案' } }),
    toReplayLine({ v: 1, kind: 'observed', seq: 1, service: 'forgeProposals', verb: 'createProposal', result: { proposalId: 'pr-1' } }),
    toReplayLine({ v: 1, kind: 'event', seq: 1, channel: 'forge:events/tasks-changed', payload: { projectId: 'p' } }),
  ].join('\n')

  it('header + 三类步骤全量解析（顺序保持）', () => {
    const fixture = parseReplayDocument(doc)
    expect(fixture.header.kind).toBe('header')
    expect(fixture.steps.map((s) => s.kind)).toEqual(['verb', 'observed', 'event'])
    expect(fixture.steps[0]).toMatchObject({ seq: 1, verb: 'createProposal' })
  })

  it('尾随换行容忍（文件末空行）', () => {
    expect(parseReplayDocument(`${doc}\n`).steps).toHaveLength(3)
  })

  it('首行非 header → 拒绝；header 重复 → 拒绝', () => {
    const verbFirst = doc.split('\n').slice(1).join('\n')
    expect(() => parseReplayDocument(verbFirst)).toThrow(/header/)
    expect(() => parseReplayDocument(`${doc}\n${doc.split('\n')[0]}`)).toThrow(/header/)
  })

  it('空文档 → 拒绝', () => {
    expect(() => parseReplayDocument('')).toThrow(/header/)
    expect(() => parseReplayDocument('\n\n')).toThrow(/header/)
  })

  it('中途畸形行 → 行号定位（file 面第 N 行即文档第 N 行）', () => {
    const broken = `${doc.split('\n').slice(0, 2).join('\n')}\n{{{`
    try {
      parseReplayDocument(broken)
      expect.unreachable('须抛')
    } catch (e) {
      expect((e as Error).message).toContain('第 3 行')
    }
  })
})
