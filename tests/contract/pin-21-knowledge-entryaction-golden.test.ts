// G1 pin ㉓（knowledge-review-ui 1.5——golden 先行，防契约漂移）。
// 权威：proposal §2.2/§3 + .forge/docs/proposals/knowledge-review-ui/testing/contracts/
// entry-action-channel.md（§3.3 SA-1 / SA-2——结构断言入契约，防形状不防行为；禁恒真）。
// SA-1 七通道 ↔ 服务面方法一一对应：
//   ① KNOWLEDGE_CHANNELS 六键锚（值精确）；② 通道→门面方法映射表（entryAction ↔
//   confirmBatch/rejectBatch/moveEntry/updateEntry/createDomain 五分支）——satisfies
//   类型级锚 keyof KnowledgeService（方法缺席即编译红）+ types.ts 声明行机械审计；
//   ③ knowledge-rpc.ts 注册行 ↔ KnowledgeChannelService Pick 面一致性（注册行全集 ⊆
//   Pick 成员集——注册了通道但 Pick 漏扩即红，防通道 404）。
// SA-2 码集 ↔ 夹具一一对应：DTO 封闭码集（EntryActionFailureCode 七成员 +
//   EntryActionRequestRejectCode）+ success 样例 ↔ fixtures/entryAction/ 文件逐位对应
//   （删码不删夹具 / 加码不加样例即红）。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS } from '../../packages/contracts/src/channels.js'
import type { BrowseKnowledgeService } from '../../packages/plugins/knowledge/src/service/types.js'
import { ROOT } from './pins.js'

const FIXTURES_DIR = join(ROOT, 'e2e/support/knowledge-golden/fixtures')
const ENTRY_ACTION_DIR = join(FIXTURES_DIR, 'entryAction')

const readSrc = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

// ── SA-1 六通道 ↔ 服务面方法一一对应 ──

/** 通道 → 门面方法映射（通道键面 = KNOWLEDGE_CHANNELS 全集；方法名面 = KnowledgeService 成员） */
const CHANNEL_FACADE_METHODS = {
  browse: ['browse'],
  listEntries: ['listEntries'],
  entryDetail: ['getEntryDetail'],
  heat: ['heatByEntry'],
  sessionRecall: ['sessionRecall'],
  entryAction: ['confirmBatch', 'rejectBatch', 'moveEntry', 'updateEntry', 'createDomain'],
  recallFeedback: ['recallFeedback'],
} as const satisfies Record<keyof typeof KNOWLEDGE_CHANNELS, readonly (keyof BrowseKnowledgeService)[]>

/** 回执码集样例矩阵（契约 §3.2——文件名 → 该夹具必须携带的 reason 标记；success = 无失败码） */
const FIXTURE_REASON_MATRIX: Readonly<Record<string, string | null>> = {
  'confirm-batch-success.json': null,
  'cas-failed-confirm.json': 'cas-failed',
  'reject-batch-success.json': null,
  'rejected-confirmed.json': 'rejected-confirmed',
  'precheck-failed.json': 'precheck-failed',
  'not-found.json': 'not-found',
  'invalid-request-multi.json': 'invalid-request',
  'domain-depth.json': 'domain-depth',
  'yaml-invalid.json': 'yaml-invalid',
  'move-editmeta-success.json': null,
  'stale.json': 'stale', // 死码记账：'stale' 当前服务面不产出（CAS 锚待通道层扩展），合成夹具预录承载码集封闭性
}

/** 从 TypeScript 类型别名声明块内提取带引号字面量成员（JSDoc 无引号文本天然排除） */
function unionLiterals(src: string, typeAlias: string): string[] {
  const block = src.match(new RegExp(`export type ${typeAlias} =([\\s\\S]*?)(?=\\n?export (?:type|interface) |$)`))?.[1]
  expect(block, `dto/knowledge.ts 未找到 export type ${typeAlias}`).toBeTruthy()
  return [...((block as string).matchAll(/'([a-z][a-z-]*)'/g))].map((m) => m[1] as string).sort()
}

/** 递归收集 JSON 值内全部字符串（含嵌套对象/数组——reason/code/message 标记扫描基） */
function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(collectStrings)
  return []
}

describe('SA-1 七通道 ↔ 服务面方法一一对应（防 Pick 漏扩致通道 404）', () => {
  it('KNOWLEDGE_CHANNELS = 七通道（值精确——第五既有 + entryAction 人工裁决写面 + stage④ 1.7 recallFeedback 召回反馈动作写面）', () => {
    expect({ ...KNOWLEDGE_CHANNELS }).toEqual({
      browse: 'forge:knowledge/browse',
      listEntries: 'forge:knowledge/listEntries',
      entryDetail: 'forge:knowledge/entryDetail',
      heat: 'forge:knowledge/heat',
      sessionRecall: 'forge:knowledge/sessionRecall',
      entryAction: 'forge:knowledge/entryAction',
      recallFeedback: 'forge:knowledge/recallFeedback',
    })
  })

  it('通道→门面方法映射表键面 = 七通道全集（satisfies 类型级锚：方法缺席/通道缺席均编译红）', () => {
    expect(Object.keys(CHANNEL_FACADE_METHODS).sort()).toEqual(Object.keys(KNOWLEDGE_CHANNELS).sort())
    expect(CHANNEL_FACADE_METHODS.entryAction).toEqual([
      'confirmBatch',
      'rejectBatch',
      'moveEntry',
      'updateEntry',
      'createDomain',
    ])
  })

  it('门面方法在位：service/types.ts KnowledgeService 声明行逐法机械审计', () => {
    const src = readSrc('packages/plugins/knowledge/src/service/types.ts')
    for (const methods of Object.values(CHANNEL_FACADE_METHODS)) {
      for (const method of methods) {
        expect(src, `KnowledgeService.${method} 声明行缺席（服务面漏扩）`).toMatch(
          new RegExp(`^  ${method}\\(`, 'm'),
        )
      }
    }
  })

  it('knowledge-rpc.ts：注册行全集 ⊆ KNOWLEDGE_CHANNELS 键面且 ⊆ Pick 成员集（漏扩 Pick 即红）', () => {
    const src = readSrc('apps/host/src/ipc/knowledge-rpc.ts')
    const registered = [...src.matchAll(/ipc\.register\(\s*KNOWLEDGE_CHANNELS\.(\w+),/g)].map((m) => m[1] as string)
    const pickBlock = src.match(/Pick<\s*BrowseKnowledgeService,\s*([\s\S]*?)>/)?.[1]
    expect(pickBlock, 'KnowledgeChannelService Pick 声明缺席').toBeTruthy()
    const pickMembers = [...((pickBlock as string).matchAll(/'(\w+)'/g))].map((m) => m[1] as string)
    const channelKeys = Object.keys(KNOWLEDGE_CHANNELS)
    expect(registered.length, '注册行数与 Pick 面零对齐（通道 404 风险面）').toBeGreaterThan(0)
    for (const key of registered) {
      expect(channelKeys, `注册行 KNOWLEDGE_CHANNELS.${key} 不在通道键面`).toContain(key)
      for (const method of CHANNEL_FACADE_METHODS[key as keyof typeof CHANNEL_FACADE_METHODS]) {
        expect(pickMembers, `通道 KNOWLEDGE_CHANNELS.${key} 已注册但 Pick 面漏扩 ${method}（防 404）`).toContain(method)
      }
    }
    // 五通道既有注册零回退（既有行为零回归锚）
    for (const key of ['browse', 'listEntries', 'entryDetail', 'heat', 'sessionRecall']) {
      expect(registered, `既有通道 KNOWLEDGE_CHANNELS.${key} 注册行退役`).toContain(key)
    }
  })
})

describe('SA-2 码集 ↔ 夹具一一对应（防删码不删夹具、加码不加样例）', () => {
  const dtoSrc = readSrc('packages/contracts/src/dto/knowledge.ts')
  const failureCodes = unionLiterals(dtoSrc, 'EntryActionFailureCode')
  const rejectCodes = unionLiterals(dtoSrc, 'EntryActionRequestRejectCode')
  const allCodes = [...failureCodes, ...rejectCodes].sort()

  it('DTO 码集封闭锚：failure 七成员 + invalid-request（契约 §2）。注：\'stale\' 为死码——当前服务面不产出（CAS 锚待通道层扩展），夹具 stale.json 预录维持码集↔夹具封闭', () => {
    expect(failureCodes).toEqual([
      'cas-failed',
      'domain-depth',
      'not-found',
      'precheck-failed',
      'rejected-confirmed',
      'stale',
      'yaml-invalid',
    ])
    expect(rejectCodes).toEqual(['invalid-request'])
  })

  it('五通道既有 golden 夹具在盘（零漂移基准锚——不触碰）', () => {
    for (const name of ['browse', 'listEntries', 'entryDetail', 'heat', 'sessionRecall']) {
      expect(readdirSync(FIXTURES_DIR), `既有夹具 ${name}.json 缺席`).toContain(`${name}.json`)
    }
  })

  it('entryAction 夹具文件集 ↔ 样例矩阵逐位对应（多文件/缺文件即红）', () => {
    expect(readdirSync(ENTRY_ACTION_DIR).sort()).toEqual(Object.keys(FIXTURE_REASON_MATRIX).sort())
  })

  it('每夹具形制合法（format/version/channel）且携带矩阵指名的 reason 标记', () => {
    for (const [file, reason] of Object.entries(FIXTURE_REASON_MATRIX)) {
      const parsed = JSON.parse(readFileSync(join(ENTRY_ACTION_DIR, file), 'utf8')) as Record<string, unknown>
      expect(parsed['format'], `${file} 形制`).toBe('dsh-forge/knowledge-golden')
      expect(parsed['version'], `${file} 版本`).toBe(1)
      expect(parsed['channel'], `${file} 通道`).toBe('forge:knowledge/entryAction')
      expect(parsed['request'], `${file} 缺 request 载荷`).toBeTruthy()
      const strings = collectStrings(parsed['response'])
      if (reason === null) {
        for (const code of allCodes) {
          expect(strings, `${file} 为 success 样例、不得携带失败码 ${code}`).not.toContain(code)
        }
      } else {
        expect(strings, `${file} 未携带矩阵指名 reason ${reason}`).toContain(reason)
      }
    }
  })

  it('码集 ↔ 夹具双向封闭：每码恰一夹具承载、夹具内失败码全部 ∈ DTO 码集', () => {
    const carrier = new Map<string, string[]>()
    for (const file of Object.keys(FIXTURE_REASON_MATRIX)) {
      const strings = collectStrings(JSON.parse(readFileSync(join(ENTRY_ACTION_DIR, file), 'utf8'))['response'])
      for (const code of allCodes) {
        if (strings.includes(code)) carrier.set(code, [...(carrier.get(code) ?? []), file])
      }
    }
    for (const code of allCodes) {
      expect(carrier.get(code) ?? [], `码 ${code} 无夹具样例（加码不加样例）`).toHaveLength(1)
    }
    expect(carrier.size).toBe(allCodes.length)
  })
})
