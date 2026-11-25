// ForgeDirs 基座单测：本体十键、拓扑解析、成环/缺依赖/撞名、参数校验（spec §2.1、§2.2）
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveDirName } from './derive-dir.js'
import {
  FORGE_BASE_DIR_ENTRIES,
  FORGE_DIR_KEYS,
  isValidDirParam,
  resolveForgeDirs,
  type ForgeDirDeclaration,
  type ForgeDirSources,
} from './forge-dirs.js'

const SOURCES: ForgeDirSources = {
  dshHome: 'C:\\dsh-home',
  projectRoot: 'Z:\\project\\dsh\\dsh-forge',
  workspaceRoot: 'Z:\\project\\dsh\\dsh-forge\\.forge\\worktrees\\plugins',
}

const PROJECT_KEY = deriveDirName(SOURCES.projectRoot)

const own = (source: string, entries: Record<string, unknown>): ForgeDirDeclaration =>
  ({ source, entries }) as unknown as ForgeDirDeclaration

describe('ForgeDirs 本体键（AC1——十个键，不包含其它键）', () => {
  it('键集恰为七个无参 + 三个带参', () => {
    expect([...FORGE_DIR_KEYS].sort()).toEqual(
      [
        'forge.home',
        'forge.db',
        'forge.project_runtime_dir',
        'forge.task_runtime_dir',
        'forge.docs_root',
        'forge.tmp',
        'forge.worktrees',
        'forge.spec_dir',
        'forge.dossier_dir',
        'forge.task_logs_dir',
      ].sort(),
    )
  })

  it('依赖关系符合键表：db/project_runtime_dir 依赖 forge.home；task_runtime_dir 依赖 project_runtime_dir + projectRoot', () => {
    const declared = resolveForgeDirs([own('lib/path', { ...BASE })], SOURCES)
    expect(declared['forge.home']).toBe(join(SOURCES.dshHome, 'forge'))
    expect(declared['forge.db']).toBe(join(SOURCES.dshHome, 'forge', 'db'))
    expect(declared['forge.project_runtime_dir']).toBe(join(SOURCES.dshHome, 'forge', 'projects'))
    expect(declared['forge.task_runtime_dir']).toBe(
      join(SOURCES.dshHome, 'forge', 'projects', PROJECT_KEY),
    )
    expect(declared['forge.docs_root']).toBe(join(SOURCES.workspaceRoot, '.forge', 'docs'))
    expect(declared['forge.tmp']).toBe(join(SOURCES.workspaceRoot, '.forge', 'tmp'))
    expect(declared['forge.worktrees']).toBe(join(SOURCES.workspaceRoot, '.forge', 'worktrees'))
  })

  it('带参目录：spec_dir(slug)、dossier_dir(slug+localId)、task_logs_dir(slug+localId)', () => {
    const slug = 'forge-dirs-unification'
    const localId = '1.1'
    const declared = resolveForgeDirs([own('lib/path', { ...BASE })], SOURCES, { slug, localId })
    expect(declared['forge.spec_dir']).toBe(join(SOURCES.workspaceRoot, '.forge', 'docs', 'specs', slug))
    expect(declared['forge.dossier_dir']).toBe(
      join(SOURCES.workspaceRoot, '.forge', 'docs', 'proposals', slug, 'issues', localId),
    )
    expect(declared['forge.task_logs_dir']).toBe(
      join(SOURCES.dshHome, 'forge', 'projects', PROJECT_KEY, 'logs', slug, localId),
    )
  })
})

describe('运行期注册表', () => {
  it('无参形态调用（forge_dirs）：参数缺席时带参条目跳过', () => {
    const declared = resolveForgeDirs([own('lib/path', { ...BASE })], SOURCES)
    expect(declared['forge.docs_root']).toContain('.forge')
    expect('forge.spec_dir' in declared).toBe(false)
  })

  it('成环报错并点名环上全部键，不返回路径', () => {
    const loop = {
      'custom.a': {
        description: 'a',
        deps: ['custom.b'] as const,
        resolve: (deps: Record<string, string>) => deps['custom.b'],
      },
      'custom.b': {
        description: 'b',
        deps: ['custom.a'] as const,
        resolve: (deps: Record<string, string>) => deps['custom.a'],
      },
    }
    expect(() => resolveForgeDirs([own('p', loop)], SOURCES)).toThrow(
      /custom\.a[\s\S]*custom\.b|custom\.b[\s\S]*custom\.a/,
    )
  })

  it('依赖的键缺席报错并点名缺席的键，不返回路径', () => {
    const dangling = {
      'custom.x': {
        description: 'x',
        deps: ['custom.missing'] as const,
        resolve: (deps: Record<string, string>) => deps['custom.missing'],
      },
    }
    expect(() => resolveForgeDirs([own('p', dangling)], SOURCES)).toThrow(/custom\.missing/)
  })

  it('两个声明方同名键报错并点名两方，不取先到者', () => {
    const a = {
      'knowledge.root': {
        description: 'a 方的',
        deps: [] as const,
        resolve: () => 'A',
      },
    }
    const b = {
      'knowledge.root': {
        description: 'b 方的',
        deps: [] as const,
        resolve: () => 'B',
      },
    }
    expect(() => resolveForgeDirs([own('knowledge', a), own('other', b)], SOURCES)).toThrow(
      /knowledge.*other|other.*knowledge/,
    )
  })

  it('参数不合法：拒绝并点名不合法的参数', () => {
    expect(() =>
      resolveForgeDirs([own('lib/path', { ...BASE })], SOURCES, { slug: '../evil', localId: '1.1' }),
    ).toThrow(/slug/)
    expect(() =>
      resolveForgeDirs([own('lib/path', { ...BASE })], SOURCES, { slug: 's', localId: 'a/b' }),
    ).toThrow(/localId/)
  })
})

describe('参数校验函数（AC5）', () => {
  it('合法值：字母数字开头，含 . _ -', () => {
    expect(isValidDirParam('abc')).toBe(true)
    expect(isValidDirParam('A9')).toBe(true)
    expect(isValidDirParam('forge-dirs_unification.v2')).toBe(true)
    expect(isValidDirParam('1.1')).toBe(true)
  })

  it('不合法值：分隔符、..、空、非法首字符', () => {
    expect(isValidDirParam('')).toBe(false)
    expect(isValidDirParam('../evil')).toBe(false)
    expect(isValidDirParam('a/b')).toBe(false)
    expect(isValidDirParam('a\\b')).toBe(false)
    expect(isValidDirParam('..')).toBe(false)
    expect(isValidDirParam('_lead')).toBe(false)
    expect(isValidDirParam('.dot')).toBe(false)
  })
})

/** 本体十条（实现导出的登记条目，forge_dirs/forge_resolve_path 同源） */
const BASE = FORGE_BASE_DIR_ENTRIES
