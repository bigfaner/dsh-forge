// 真 cordis 契约测试（knowledge 目录键声明——plugin 装载面守卫钉）：
// 用真实 @deepseek-ai/cordis 包经 ctx.plugin 装载真实 knowledgePlugin（inject 四服务
// 桩 + 显式 dbFile hermetic），钉两条：
//   a) 装载完成后 dirKeys.knowledge 经消费缝可取（根 scope provide 条目对象）；
//   b) 键集 = knowledge.root / knowledge.global（删登记 = a 红；改错键集/形状 = b 红）。
// 与 expert-squad tests/declare-dirs-cordis.test.ts 同款钉法（消费缝镜像同构
// project/host/dirs/anchors.ts collectDeclaredDirKeys）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Context as CordisContext, type Plugin } from '@deepseek-ai/cordis'
import knowledgePlugin, { KNOWLEDGE_DIR_ENTRIES } from '../host/index.js'

// 自持存储锚摘除（hermetic——declare-dirs.test.ts 同口径）：装配走显式 dbFile。
const prevEnv = { DSH_HOME: process.env.DSH_HOME, DSH_FORGE_TASKS_HOME: process.env.DSH_FORGE_TASKS_HOME }
delete process.env.DSH_HOME
delete process.env.DSH_FORGE_TASKS_HOME
const tempDirs: string[] = []
function tempDbFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-dirs-cordis-'))
  tempDirs.push(dir)
  return join(dir, 'knowledge.db')
}

/** 消费缝镜像（collectDeclaredDirKeys 同构） */
function pullDirKeys(reflect: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const r = reflect as { props?: Record<string, unknown>; get?(name: string): unknown } | undefined
  const props = r?.props
  if (props === undefined) return out
  for (const name of Object.keys(props)) {
    if (!name.startsWith('dirKeys.')) continue
    let value: unknown
    try {
      value = r?.get?.(name)
    } catch {
      continue
    }
    if (value === null || typeof value !== 'object') continue
    Object.assign(out, value as Record<string, unknown>)
  }
  return out
}

type KnPlugin = Plugin.Function<{ dbFile?: string }>
const knPlugin = knowledgePlugin as unknown as KnPlugin
const consumerPlugin = ((c2: CordisContext) => {
  consumerReflect = c2.reflect
}) as unknown as KnPlugin
const sessionPlugin = (async (c: CordisContext) => {
  const scoped = c.isolate('forgeDirs')
  await scoped.plugin(consumerPlugin)
}) as unknown as KnPlugin

let ctx: CordisContext
let consumerReflect: unknown

beforeAll(async () => {
  ctx = new Context()
  // inject 四服务桩（tools/systemPrompt/connection/workspaceRegistry——最小形状）
  ctx.provide('tools', { register: () => () => {} })
  ctx.provide('systemPrompt', { section: () => () => {} })
  ctx.provide('connection', { fetch: { register: () => {} } })
  ctx.provide('workspaceRegistry', {})
  await ctx.plugin(sessionPlugin, { name: 'session-runtime' } as never)
  await ctx.plugin(knPlugin, { name: 'knowledge', dbFile: tempDbFile() } as never)
})

afterAll(async () => {
  await (ctx as unknown as { shutdown?: () => Promise<void> }).shutdown?.()
  ;(ctx as unknown as { destroy?: () => void }).destroy?.()
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  for (const d of tempDirs) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    } catch {
      // 库句柄释放时序竞态（Windows EPERM）——临时目录留给系统清理，不影响断言
    }
  }
})

describe('真装载 + 消费缝拉取（knowledge 登记把守）', () => {
  it('装载完成后 dirKeys.knowledge 经消费缝可取（两键齐备）', () => {
    const pulled = pullDirKeys(consumerReflect)
    expect(Object.keys(pulled)).toEqual(
      expect.arrayContaining(['knowledge.root', 'knowledge.global']),
    )
  })

  it('约定名取值 = 登记对象本体，键集受检（删登记或改错键集/形状 = 红）', () => {
    const reflect = consumerReflect as { get(name: string): unknown; props: Record<string, unknown> }
    expect(Object.keys(reflect.props)).toContain('dirKeys.knowledge')
    expect(reflect.get('dirKeys.knowledge')).toBe(KNOWLEDGE_DIR_ENTRIES)
    expect(Object.keys(KNOWLEDGE_DIR_ENTRIES).sort()).toEqual(['knowledge.global', 'knowledge.root'])
  })
})
