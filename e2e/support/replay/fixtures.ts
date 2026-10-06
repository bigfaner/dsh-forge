// 5.1 夹具装配/落盘/载入（AC3/AC4 载体面）。两用途一格式：
//   · 手工构造（Implementation Notes：「手工构造夹具同格式可用」）——createFixtureBuilder
//     （observed 行承载动词结算——claim dispatchPrompt 全文/submit 载荷结算；event 行承载
//     fix 链事件流；5.4 dogfood 录制器同构落账消费本构造器）；
//   · 落盘/载入（JSONL 文件面）——writeFixture/loadFixture（dogfood 首录产物与
//     e2e/specs/m2 消费同径）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  parseReplayDocument,
  REPLAY_FORMAT,
  REPLAY_VERSION,
  toReplayLine,
  type ReplayFixture,
  type ReplayHeader,
  type ReplayServiceName,
  type ReplayStep,
  type ReplayWriteVerb,
} from './format.js'

/** 夹具元信息（header 面——source/note 可选） */
export interface FixtureMeta {
  readonly source?: 'dogfood' | 'hand'
  readonly note?: string
}

/** 夹具构造器（链式累积；seq 自增——verb/observed/event 共用单列） */
export interface ReplayFixtureBuilder {
  verb(service: ReplayServiceName, verb: ReplayWriteVerb, args: Record<string, unknown>): ReplayFixtureBuilder
  observed(service: ReplayServiceName, verb: ReplayWriteVerb, result: unknown, at?: string): ReplayFixtureBuilder
  event(projectId: string, at?: string): ReplayFixtureBuilder
  build(): ReplayFixture
}

/** 手工构造夹具（同格式可用——与 dogfood 首录产物逐字同构） */
export function createFixtureBuilder(meta: FixtureMeta = {}): ReplayFixtureBuilder {
  let seq = 0
  const steps: ReplayStep[] = []
  const builder: ReplayFixtureBuilder = {
    verb(service, verb, args) {
      steps.push({ v: REPLAY_VERSION, kind: 'verb', seq: ++seq, service, verb, args })
      return builder
    },
    observed(service, verb, result, at) {
      steps.push({ v: REPLAY_VERSION, kind: 'observed', seq: ++seq, service, verb, result, ...(at !== undefined ? { at } : {}) })
      return builder
    },
    event(projectId, at) {
      steps.push({
        v: REPLAY_VERSION,
        kind: 'event',
        seq: ++seq,
        channel: 'forge:events/tasks-changed',
        payload: { projectId },
        ...(at !== undefined ? { at } : {}),
      })
      return builder
    },
    build(): ReplayFixture {
      const header: ReplayHeader = {
        v: REPLAY_VERSION,
        kind: 'header',
        format: REPLAY_FORMAT,
        recordedAt: new Date().toISOString(),
        ...(meta.source !== undefined ? { source: meta.source } : {}),
        ...(meta.note !== undefined ? { note: meta.note } : {}),
      }
      return { header, steps }
    },
  }
  return builder
}

/** 夹具 → JSONL 全文（header 行 + 步骤行 + 尾随换行；writeFixture 单源） */
export function fixtureToJSONL(fixture: ReplayFixture): string {
  return [fixture.header, ...fixture.steps].map(toReplayLine).join('\n') + '\n'
}

/** 夹具落盘（嵌套目录建仓；UTF-8 无 BOM） */
export function writeFixture(path: string, fixture: ReplayFixture): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, fixtureToJSONL(fixture), 'utf8')
}

/** 夹具载入（格式违例 fail-loud——ReplayFormatError 带行号） */
export function loadFixture(path: string): ReplayFixture {
  return parseReplayDocument(readFileSync(path, 'utf8'))
}
