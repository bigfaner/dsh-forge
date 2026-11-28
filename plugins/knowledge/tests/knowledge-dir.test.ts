// 知识目录 config 解析与消费点物化单测（knowledge-plugin-migration 1.5 提案项 4）：
//   · resolveKnowledgeDir 纯函数三态（显式 / 缺省 / 非法）+ per-project map 命中/未命中；
//   · 消费点物化（AC2）：config 解析零 IO——apply 期不预建目录，registerProject 读时
//     mkdir recursive（WYSIWYG + ACL 时序）；非法值 fail-soft 回退缺省 + warn 埋点不静默。
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { defaultKnowledgeDirOf, resolveKnowledgeDir } from '../host/knowledge-dir.js'
import knowledgePlugin, { KNOWLEDGE_SERVICE_NAME } from '../host/index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition, KnowledgeContextFace } from '../host/tools/index.js'
import type { BrowseKnowledgeService } from '../host/service/index.js'
import type { DiagEventPayload } from '@dsh-forge/lib-api/diag'

// ───────────────── resolveKnowledgeDir 纯函数三态 ─────────────────

describe('resolveKnowledgeDir 三态（AC1）', () => {
  it('缺省态：config 缺席 / knowledgeDir 缺席 / map 未命中 → {projectDir}/.knowledge（分隔符随 projectDir 风格）', () => {
    expect(resolveKnowledgeDir(undefined, 'Z:\\ws\\demo')).toBe('Z:\\ws\\demo\\.knowledge')
    expect(resolveKnowledgeDir({}, '/ws/demo')).toBe('/ws/demo/.knowledge')
    expect(resolveKnowledgeDir({ knowledgeDir: undefined }, 'Z:\\ws\\demo')).toBe('Z:\\ws\\demo\\.knowledge')
    expect(resolveKnowledgeDir({ knowledgeDir: { 'Z:\\other': 'Z:\\else' } }, 'Z:\\ws\\demo')).toBe(
      'Z:\\ws\\demo\\.knowledge',
    )
  })

  it('显式态：字面量非空 → 该值（trim 归一）；per-project map 键命中 → 该项目值', () => {
    expect(resolveKnowledgeDir({ knowledgeDir: 'Z:\\kn-root' }, 'Z:\\ws\\demo')).toBe('Z:\\kn-root')
    expect(resolveKnowledgeDir({ knowledgeDir: '  /data/kn  ' }, '/ws/demo')).toBe('/data/kn')
    expect(resolveKnowledgeDir({ knowledgeDir: { 'Z:\\ws\\demo': 'Z:\\custom-kn' } }, 'Z:\\ws\\demo')).toBe(
      'Z:\\custom-kn',
    )
  })

  it('非法态：空串/空白字面量、map 命中值空、config 劣形（原语）→ undefined（消费点回退缺省 + warn）', () => {
    expect(resolveKnowledgeDir({ knowledgeDir: '' }, 'Z:\\p')).toBeUndefined()
    expect(resolveKnowledgeDir({ knowledgeDir: '   ' }, 'Z:\\p')).toBeUndefined()
    expect(resolveKnowledgeDir({ knowledgeDir: { 'Z:\\p': '' } }, 'Z:\\p')).toBeUndefined()
    expect(resolveKnowledgeDir({ knowledgeDir: 42 as unknown as string }, 'Z:\\p')).toBeUndefined()
    expect(resolveKnowledgeDir({ knowledgeDir: null as unknown as string }, 'Z:\\p')).toBeUndefined()
  })

  it('defaultKnowledgeDirOf = 缺省派生单源（消费点回退径与解析缺省态同字面）', () => {
    expect(defaultKnowledgeDirOf('Z:\\ws\\demo')).toBe(resolveKnowledgeDir(undefined, 'Z:\\ws\\demo'))
  })
})

// ───────────────── 消费点物化（AC2）：apply 期零预建，读时 mkdir recursive ─────────────────

/** 假宿主 ctx（plugin.test.ts TempRuntime 窄化——emit 捕获 diag 埋点） */
function makeRt(): {
  dbFile: () => string
  ctx: () => KnowledgeContextFace
  provided: Map<string, unknown>
  diagEvents: DiagEventPayload[]
  cleanup: () => void
} {
  let dir: string | undefined
  const provided = new Map<string, unknown>()
  const diagEvents: DiagEventPayload[] = []
  const ctx = (): KnowledgeContextFace => ({
    tools: { register: (_d: KnowledgeToolDefinition) => () => {} },
    systemPrompt: { section: (_s: KnowledgePromptSection) => () => {} },
    emit: (_event: string, payload: unknown) => {
      diagEvents.push(payload as DiagEventPayload)
    },
    reflect: {
      get: () => undefined,
      provide: (name: string, service: unknown) => {
        provided.set(name, service)
        return () => provided.delete(name)
      },
    },
  })
  return {
    dbFile: () => {
      dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-kn-dir-'))
      return join(dir, 'knowledge.db')
    },
    ctx,
    provided,
    diagEvents,
    cleanup: () => {
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    },
  }
}

const runtimes: ReturnType<typeof makeRt>[] = []
afterAll(() => {
  for (const rt of runtimes) rt.cleanup()
})

describe('消费点物化（AC2——config 解析零 IO，读时 mkdir recursive）', () => {
  it('per-project map 命中：apply 期不预建（configured 与缺省目录均缺席）；registerProject 读时 mkdir recursive 落配置目录', async () => {
    const rt = makeRt()
    runtimes.push(rt)
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-dir-ws-'))
    try {
      const wsDir = join(root, 'ws')
      mkdirSync(wsDir, { recursive: true })
      const configuredDir = join(root, 'custom-kn')
      const dispose = knowledgePlugin(rt.ctx(), {
        dbFile: rt.dbFile(),
        knowledgeDir: { [wsDir]: configuredDir },
      })
      // apply 期零预建（WYSIWYG + ACL 时序——不在装配期落盘）
      expect(existsSync(configuredDir)).toBe(false)
      expect(existsSync(join(wsDir, '.knowledge'))).toBe(false)
      const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as BrowseKnowledgeService
      await service.registerProject({ wsPath: wsDir, projectId: 'p-dir' })
      // 消费点读时物化（mkdir recursive）
      expect(existsSync(configuredDir)).toBe(true)
      expect(existsSync(join(wsDir, '.knowledge'))).toBe(false) // 缺省目录不被预建
      dispose()
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('缺省态（config 无 knowledgeDir）：registerProject 物化 {wsPath}/.knowledge（行为与 config 引入前等价）', async () => {
    const rt = makeRt()
    runtimes.push(rt)
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-dir-def-'))
    try {
      const wsDir = join(root, 'ws')
      mkdirSync(wsDir, { recursive: true })
      const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() })
      const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as BrowseKnowledgeService
      await service.registerProject({ wsPath: wsDir, projectId: 'p-def' })
      expect(existsSync(join(wsDir, '.knowledge'))).toBe(true)
      dispose()
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('非法态回退（fail-soft 不静默）：knowledgeDir 空白字面量 → registerProject 物化缺省目录 + knowledge-dir warn 埋点', async () => {
    const rt = makeRt()
    runtimes.push(rt)
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-dir-bad-'))
    try {
      const wsDir = join(root, 'ws')
      mkdirSync(wsDir, { recursive: true })
      const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile(), knowledgeDir: '   ' })
      const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as BrowseKnowledgeService
      await service.registerProject({ wsPath: wsDir, projectId: 'p-bad' })
      expect(existsSync(join(wsDir, '.knowledge'))).toBe(true)
      const warn = rt.diagEvents.find((e) => e.event === 'knowledge-dir' && e.level === 'warn')
      expect(warn).toBeDefined()
      expect(String(warn?.message)).toContain(wsDir)
      dispose()
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
})
