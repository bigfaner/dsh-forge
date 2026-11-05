// golden 结构等价比对器 + fixture 载入（SC-8 断言面）。
// 结构等价 = 递归形状一致：JSON 类型一致（object/array/string/number/boolean/null）、
// 对象键集一致（顺序无关）、数组长度一致——标量值不参与（录制与比对两次运行间的
// UUID/时间戳/自增 id 天然漂移；确定性值断言归 core 单测，本面只锁「响应形状零变化」）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** fixture 单文件形制（录制来源 = core 现役供数，迁移前形态） */
export interface GoldenFixture {
  format: 'dsh-forge/knowledge-golden'
  version: 1
  channel: string
  recordedAt: string
  source: { provider: 'core'; detail: string; harness: string }
  request: Record<string, unknown>
  response: unknown
}

export const GOLDEN_FORMAT = 'dsh-forge/knowledge-golden' as const

export function loadGoldenFixture(fixturesDir: string, channel: string): GoldenFixture {
  const file = join(fixturesDir, `${channel.replace('forge:knowledge/', '')}.json`)
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as GoldenFixture
  if (parsed.format !== GOLDEN_FORMAT) throw new Error(`fixture 形制不符：${file}`)
  if (parsed.channel !== channel) throw new Error(`fixture 通道名失配：${file}（${parsed.channel} ≠ ${channel}）`)
  return parsed
}

/** JSON 结构类型（null 单列——与 undefined/对象区分） */
function jsonType(value: unknown): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value as 'string' | 'number' | 'boolean'
}

/** 结构等价断言（fail-loud：首个漂移点带 JSON path 报出） */
export function assertSameStructure(golden: unknown, live: unknown, path = '$'): void {
  const g = jsonType(golden)
  const l = jsonType(live)
  if (g !== l) throw new Error(`golden 结构漂移 @${path}：类型 ${g} ≠ ${l}`)
  if (g === 'object') {
    const gk = Object.keys(golden as Record<string, unknown>).sort()
    const lk = Object.keys(live as Record<string, unknown>).sort()
    if (gk.join(',') !== lk.join(',')) {
      const missing = gk.filter((k) => !lk.includes(k))
      const added = lk.filter((k) => !gk.includes(k))
      throw new Error(`golden 结构漂移 @${path}：键集失配（缺席 [${missing.join(',')}] / 新增 [${added.join(',')}]）`)
    }
    for (const key of gk) {
      assertSameStructure((golden as Record<string, unknown>)[key], (live as Record<string, unknown>)[key], `${path}.${key}`)
    }
    return
  }
  if (g === 'array') {
    const ga = golden as unknown[]
    const la = live as unknown[]
    if (ga.length !== la.length) throw new Error(`golden 结构漂移 @${path}：数组长度 ${ga.length} ≠ ${la.length}`)
    ga.forEach((item, i) => assertSameStructure(item, la[i], `${path}[${i}]`))
  }
}
