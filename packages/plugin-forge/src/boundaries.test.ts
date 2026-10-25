// 3.2 单测（3.4 pin 修订——tech-design 边界 1）—— AC1 机械自证：deps =
// contracts + path-key + dsh 上游运行时包白名单（@deepseek-ai/dsh-subagent-in-process-driver
// ——dispatchTask spawn 通道；插件对 core 仍零实现级 import，纪律不破：driver 非 core）
// + 零 cordis 运行时依赖（knowledge 同型）。构建图四面：package.json dependencies
// （发版运行期面）、src 非测试源（import 面）、tsconfig references（tsc 拓扑——driver
// 为外部 npm 精确 pin 非工作区工程，不入 references）、运行时包名扫描（@deepseek-ai/*
// 白名单 + cordis）。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

/** dsh 上游运行时包白名单（tech-design 边界 1：boundaries pin 修订——「contracts +
 *  path-key + dsh 上游运行时包白名单」；新成员 = 契约面变更）
 *  S7 增员 @deepseek-ai/dsh-session-projection：类型面 devDependency（declare-module
 *  合并进 SessionProjectionMap + 投影定义形状 authority）——运行期零 import（fold unit
 *  为结构同型 plain object，registry 鸭子消费），运行时白名单（dependencies 面）不含它。
 *  1.20 增员 @deepseek-ai/dsh-session：运行期依赖（#35——'forge/progress' 读侧词汇
 *  注册 KNOWN_SESSION_EVENT_TYPES.add，公开导出 Set 的运行时追加；未注册 = 持久化
 *  读路径拒绝解读含该事件的日志=历史加载失败）。 */
const DSH_RUNTIME_ALLOWLIST = [
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-subagent-in-process-driver',
] as const

/** @deepseek-ai 类型面 import 白名单（S7——投影模块的类型合并；1.17 增员 dsh-session/types
 *  ——'forge/progress' SessionEventMap 合并锚；1.18 增员 dsh-llm/message——AD-4 循环哨兵
 *  MessageSourceMap 'forge-loop' 合并锚；零运行时 import 面） */
const DSH_TYPE_IMPORT_ALLOWLIST = [
  '@deepseek-ai/dsh-session-projection/types',
  '@deepseek-ai/dsh-session/types',
  '@deepseek-ai/dsh-llm/message',
] as const

function srcFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) files.push(p)
    }
  }
  walk(join(PKG_DIR, 'src'))
  return files
}

describe('AC1 插件依赖边界（构建图机械自证——3.4 修订：driver 白名单）', () => {
  it('package.json dependencies = contracts + path-key + driver 白名单恰三项（Hard Rule：禁 core 实现 / cordis 运行时）', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      ...DSH_RUNTIME_ALLOWLIST,
      '@dsh-forge/contracts',
      '@dsh-forge/path-key',
    ])
    for (const face of ['peerDependencies', 'optionalDependencies']) {
      expect(Object.keys(pkg[face as keyof typeof pkg] ?? {}), face).toHaveLength(0)
    }
  })

  it('src 非测试源零 @dsh-forge/core import（cwd 数据缝经 bindingsFile config——服务类型出自 contracts）', () => {
    const files = srcFiles()
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/@dsh-forge\/core/)
    }
  })

  it('src 非测试源 @deepseek-ai import 仅白名单包、且仅 spawn 真绑定单点（driver import 面收口）；类型面合并单点 = projection types（S7——devDependency 类型面，运行期零 import）', () => {
    const importers: string[] = []
    for (const f of srcFiles()) {
      const rel = relative(PKG_DIR, f).split('\\').join('/')
      const src = readFileSync(f, 'utf8')
      expect(src, `${rel} cordis`).not.toMatch(/['"]cordis['"]/)
      const specifiers = [...src.matchAll(/['"](@deepseek-ai\/[^'"]+)['"]/g)].map((m) => m[1] ?? '')
      const offending = specifiers.filter(
        (s) => !(DSH_RUNTIME_ALLOWLIST as readonly string[]).includes(s) && !(DSH_TYPE_IMPORT_ALLOWLIST as readonly string[]).includes(s),
      )
      expect(offending, `${rel} 白名单外 @deepseek-ai import`).toEqual([])
      if (specifiers.length > 0) importers.push(rel)
    }
    expect(importers.sort()).toEqual(['src/forge-loop-source.ts', 'src/progress/index.ts', 'src/projection/dispatch-events.ts', 'src/projection/dispatch-loop.ts', 'src/spawn/in-process-driver.ts'])
  })

  it('类型面收窄（S7 续）：@deepseek-ai/dsh-session-projection 仅投影模块 type-only import + declare-module 合并——零运行时 import 语法', () => {
    const src = readFileSync(join(PKG_DIR, 'src/projection/dispatch-loop.ts'), 'utf8')
    // declare-module 合并目标 = 官方 types 出口（/plan 同构）
    expect(src).toContain("declare module '@deepseek-ai/dsh-session-projection/types'")
    // 类型面单点：import type 解析锚（增广目标入程序——plan-mode types.d.ts 同款型法）
    expect(src).toMatch(/import type \{ SessionProjectionMap \} from '@deepseek-ai\/dsh-session-projection\/types'/)
    // 值面禁入：非 type import 语句与动态 import 均违例（运行期零 import——registry 鸭子消费）
    expect(src).not.toMatch(/import\s*\{[^}]*\}\s*from\s*['"]@deepseek-ai\/dsh-session-projection/)
    expect(src).not.toMatch(/import\(\s*['"]@deepseek-ai\/dsh-session-projection/)
  })

  it('tsconfig references = contracts + path-key（driver = 外部 npm 精确 pin，非工作区工程）', () => {
    const ts = JSON.parse(readFileSync(join(PKG_DIR, 'tsconfig.json'), 'utf8')) as {
      references?: { path: string }[]
    }
    const refs = (ts.references ?? []).map((r) => r.path)
    expect(refs.sort()).toEqual(['../contracts', '../path-key'])
  })
})
