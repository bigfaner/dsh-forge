// 5.1 夹具装配/落盘单测（AC3/AC4）：手工构造（同格式可用）+ 落盘-载入往返 +
// 回放结果落账（observed/event 观测行合成——5.4 dogfood 首录同构面）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseReplayDocument } from './format.js'
import { createFixtureBuilder, fixtureToJSONL, loadFixture, writeFixture } from './fixtures.js'

const tmpRoots: string[] = []

afterEach(() => {
  for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tmpPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-replay-fx-'))
  tmpRoots.push(root)
  return join(root, name)
}

describe('5.1 createFixtureBuilder · 手工构造夹具（同格式可用）', () => {
  it('verb/observed/event 累积 + seq 自增 + header 组装', () => {
    const fixture = createFixtureBuilder({ source: 'hand', note: '自证' })
      .verb('forgeTasks', 'addTask', { projectId: 'p', featureSlug: 'f', title: '任务', type: 'coding-feature' })
      .verb('forgeTasks', 'claimTask', { projectId: 'p', sessionId: 's' })
      .observed('forgeTasks', 'claimTask', { dispatchPrompt: '全文', digest: 'abc' })
      .event('p')
      .build()
    expect(fixture.header).toMatchObject({ v: 1, kind: 'header', format: 'dsh-forge-replay', source: 'hand', note: '自证' })
    expect(fixture.steps.map((s) => [s.kind, s.seq])).toEqual([
      ['verb', 1],
      ['verb', 2],
      ['observed', 3],
      ['event', 4],
    ])
    // 手工产物即合法文档（builder → JSONL → parse 全量回读）
    expect(parseReplayDocument(fixtureToJSONL(fixture)).steps).toHaveLength(4)
  })

  it('缺省 meta：source 缺席合法（非 dogfood/hand 强制场景）', () => {
    const fixture = createFixtureBuilder().verb('forgeProposals', 'createProposal', { projectId: 'p', slug: 'pr', title: '提案' }).build()
    expect(fixture.header.source).toBeUndefined()
    expect(parseReplayDocument(fixtureToJSONL(fixture)).header.source).toBeUndefined()
  })
})

describe('5.1 夹具落盘-载入往返（JSONL 文件面）', () => {
  it('writeFixture → loadFixture 等值（含嵌套目录建仓）', () => {
    const path = tmpPath(join('nested', 'dir', 'demo.jsonl'))
    const fixture = createFixtureBuilder({ source: 'dogfood' })
      .verb('forgeTasks', 'submitTask', {
        projectId: 'p',
        taskRef: { slug: 'f', localId: '1' },
        result: 'success',
        summary: '完成',
        gate: { compile: true, fmt: true, lint: true, test: true },
        sessionId: 's-2',
      })
      .build()
    writeFixture(path, fixture)
    expect(loadFixture(path)).toEqual(fixture)
  })

  it('fixtureToJSONL：尾随换行 + 行数 = header + 步骤数', () => {
    const fixture = createFixtureBuilder().event('p').event('p').build()
    const text = fixtureToJSONL(fixture)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.trimEnd().split('\n')).toHaveLength(3)
  })
})
