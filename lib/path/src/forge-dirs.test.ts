// ForgeDirs 基座单测：基座键、插件键依赖链解析、成环/缺依赖/撞名、参数校验（spec §2.1、§2.2）
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveDirName } from './derive-dir.js'
import {
  FORGE_BASE_DIR_ENTRIES,
  FORGE_DIR_KEYS,
  dirKeyEntryShapeError,
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

describe('ForgeDirs 基座键', () => {
  it('键集恰为 forge.home 一个（业务目录键归各插件声明）', () => {
    expect(FORGE_DIR_KEYS).toEqual(['forge.home'])
    expect(Object.keys(FORGE_BASE_DIR_ENTRIES)).toEqual(['forge.home'])
  })

  it('forge.home 依赖 dshHome', () => {
    const declared = resolveForgeDirs([own('lib/path', { ...BASE })], SOURCES)
    expect(declared['forge.home']).toBe(join(SOURCES.dshHome, 'forge'))
  })
})

describe('插件键经注册表解析（基座键 + 插件声明依赖链）', () => {
  /** 样例插件声明：项目目录 → spec 运行时目录 → 任务目录（三级依赖链 + 带参） */
  const SAMPLE = {
    'sample.project_dir': {
      description: '样例项目目录',
      deps: ['forge.home', 'projectRoot'],
      resolve: (deps: Record<string, string>) => join(deps['forge.home']!, 'projects', deriveDirName(deps.projectRoot!)),
    },
    'sample.runtime_dir': {
      description: '样例运行时目录',
      deps: ['sample.project_dir'],
      params: ['slug'],
      resolve: (deps: Record<string, string>, params: Record<string, string>) => join(deps['sample.project_dir']!, params.slug!),
    },
    'sample.task_dir': {
      description: '样例任务目录',
      deps: ['sample.runtime_dir'],
      params: ['slug', 'localId'],
      resolve: (deps: Record<string, string>, params: Record<string, string>) => join(deps['sample.runtime_dir']!, params.localId!),
    },
  }

  it('无参形态（forge_dirs）：带参条目参数缺席时跳过，基座键与无参插件键逐键解析', () => {
    const declared = resolveForgeDirs([own('lib/path', { ...BASE }), own('dirKeys.sample', SAMPLE)], SOURCES)
    expect(Object.keys(declared)).toEqual(['forge.home', 'sample.project_dir'])
    expect(declared['sample.project_dir']).toBe(join(SOURCES.dshHome, 'forge', 'projects', PROJECT_KEY))
  })

  it('带参形态（forge_resolve_path）：依赖链上每级取被依赖条目的解析结果', () => {
    const slug = 'forge-dirs-unification'
    const localId = '1.1'
    const declared = resolveForgeDirs(
      [own('lib/path', { ...BASE }), own('dirKeys.sample', SAMPLE)],
      SOURCES,
      { slug, localId },
    )
    const projectDir = join(SOURCES.dshHome, 'forge', 'projects', PROJECT_KEY)
    expect(declared['sample.runtime_dir']).toBe(join(projectDir, slug))
    expect(declared['sample.task_dir']).toBe(join(projectDir, slug, localId))
  })

  it('插件键依赖的键未被任何声明方提供：点名缺席的键（声明集不完整不静默）', () => {
    expect(() => resolveForgeDirs([own('lib/path', { ...BASE }), own('dirKeys.sample', { 'sample.task_dir': SAMPLE['sample.task_dir'] })], SOURCES, { slug: 's', localId: '1' })).toThrow(
      /依赖缺席.*sample\.runtime_dir/,
    )
  })
})

describe('运行期注册表', () => {
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
    const PARAMED = {
      'custom.dir': {
        description: '带参样例',
        deps: ['workspaceRoot'],
        params: ['slug', 'localId'],
        resolve: (deps: Record<string, string>, params: Record<string, string>) =>
          join(deps.workspaceRoot!, params.slug!, params.localId!),
      },
    }
    expect(() =>
      resolveForgeDirs([own('p', PARAMED)], SOURCES, { slug: '../evil', localId: '1.1' }),
    ).toThrow(/slug/)
    expect(() =>
      resolveForgeDirs([own('p', PARAMED)], SOURCES, { slug: 's', localId: 'a/b' }),
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

describe('dirKeyEntryShapeError（拉取缝形状校验单源——plugins/project 与 plugins/task-loop 共用）', () => {
  const ok = { description: 'x', deps: ['workspaceRoot'] as const, resolve: () => 'x' }

  it('合格条目 = undefined；forge.* 保留名 / 无命名空间前缀 / 坏形状各点名问题', () => {
    expect(dirKeyEntryShapeError('knowledge.root', ok)).toBeUndefined()
    expect(dirKeyEntryShapeError('forge.custom', ok)).toMatch(/forge\.\* 保留命名空间/)
    expect(dirKeyEntryShapeError('nodot', ok)).toMatch(/命名空间/)
    expect(dirKeyEntryShapeError('bad.resolve', { ...ok, resolve: 42 })).toMatch(/resolve 须为函数/)
    expect(dirKeyEntryShapeError('bad.deps', { ...ok, deps: [] })).toMatch(/deps/)
    expect(dirKeyEntryShapeError('not.object', null)).toMatch(/须为对象/)
  })
})
