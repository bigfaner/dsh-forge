// Task 3.1 kernel legs — the prefs domain (three-tier single-table store +
// closed key registry + resolution + verbs + prefs_updated). AC groups:
//
//   AC-1 三级覆盖序 — global→project→feature 逐级覆盖全用例(仅上级设置、
//            同级清除回落、feature 限定地址防跨项目同 slug 碰撞)。
//   AC-2 键注册表 — 键集全量(auto.*/worktree.*/coverage.*/eval.*,surfaces
//            不出现;coverage 补集 = spike-4 裁决)+ 类型元数据经 API 暴露;
//            键集外写 → ERR_PREF_KEY_UNKNOWN;类型越界 → ERR_PREF_VALUE_INVALID。
//   AC-3 事务与回落 — setPrefs 事务原子(失败回滚无半写);clearPrefOverride
//            后回落下一级生效值;getPrefs 返回生效值 + 来源层级。
//   IPC 面 — 三动词通道路由 + scope 形状校验 + 域错误封装原码透传。
//
// Everything below runs against the real migrated db (node:sqlite) — no
// spawn, no CLI.

import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import {
  PREF_KEY_MAP,
  PREF_KEY_REGISTRY,
  normalizePrefValue,
  requireKnownPrefKey,
  type PrefKeyDefinition,
} from '../src/main/workbench/prefs/registry.ts'
import {
  parseFeatureScopeId,
  prefScopeAddressOf,
  prefScopeChain,
} from '../src/main/workbench/prefs/prefs-repo.ts'
import { resolveEffectiveValues } from '../src/main/workbench/prefs/resolve.ts'
import { createPrefsVerbService, type PrefsVerbService } from '../src/main/workbench/prefs/prefs-service.ts'
import { createEventBatcher, type WorkbenchEventSink } from '../src/main/workbench/watcher/events.ts'
import type { WorkbenchEvent, WorkbenchVerbEvent } from '../src/main/workbench/ipc/types.ts'
import {
  WORKBENCH_VERB_CHANNELS,
  isWhitelistedWorkbenchVerbChannel,
} from '../src/main/workbench/ipc/channel-allowlist.ts'
import {
  installWorkbenchVerbs,
  type WorkbenchHandleRegistrar,
} from '../src/main/workbench/ipc/handlers.ts'
import type { WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-prefs-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

/** withPrefsDb 回调形态(真 db + 两项目种子 + 事件记录器产物)。 */
interface PrefsDbRun {
  (service: PrefsVerbService, db: DatabaseSyncLike, events: WorkbenchEvent[],
    projects: { p1: string; p2: string }): void | Promise<void>
}

async function withPrefsDb(run: PrefsDbRun): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const { db } = await openDatabase(userData)
  try {
    const at = new Date().toISOString()
    for (const id of ['p-1', 'p-2']) {
      db.prepare(
        `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
         VALUES (?, ?, ?, 'in_repo', NULL, ?)`,
      ).run(id, id, join(root, id), at)
    }
    const events: WorkbenchEvent[] = []
    const service = createPrefsVerbService({ db, onEvent: event => events.push(event) })
    await run(service, db, events, { p1: 'p-1', p2: 'p-2' })
  } finally {
    db.close()
  }
}

function rowOf(rows: readonly { key: string }[], key: string) {
  const row = rows.find(entry => entry.key === key)
  if (row === undefined) throw new Error(`row ${key} missing from prefs projection`)
  return row
}

function expectPrefCode(fn: () => unknown, code: string): void {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught, `expected ${code} rejection`).toBeInstanceOf(Error)
  // 域码通道:PrefDomainError(prefs 域)或 WorkbenchRepoError(ERR_PROJECT_NOT_FOUND)
  expect((caught as { code?: unknown }).code).toBe(code)
}

// ---------------------------------------------------------------------------
// AC-2: closed key registry (authority = forge-cli pkg/forgeconfig)
// ---------------------------------------------------------------------------

describe('prefs key registry (closed set, forge config authority)', () => {
  it('carries the full key set with the four groups and never surfaces a surface key', () => {
    expect(PREF_KEY_REGISTRY).toHaveLength(38)
    const groups = new Map<string, number>()
    for (const def of PREF_KEY_REGISTRY) groups.set(def.group, (groups.get(def.group) ?? 0) + 1)
    expect(Object.fromEntries(groups)).toEqual({ auto: 17, worktree: 2, coverage: 5, eval: 14 })
    for (const def of PREF_KEY_REGISTRY) {
      expect(def.key.startsWith('auto.') || def.key.startsWith('worktree.') || def.key.startsWith('coverage.') || def.key.startsWith('eval.')).toBe(true)
      expect(def.key.toLowerCase().includes('surface')).toBe(false) // D3: surfaces 禁入继承链
      expect(PREF_KEY_MAP.get(def.key)).toBe(def)
    }
    expect(new Set(PREF_KEY_REGISTRY.map(def => def.key)).size).toBe(38)
  })

  it('projects the forgeconfig defaults verbatim (AutoConfig / Coverage / EvalSettings)', () => {
    // auto.*(config_auto.go AutoConfigDefaults)
    expect(PREF_KEY_MAP.get('auto.test.quick')?.defaultValue).toBe(false)
    expect(PREF_KEY_MAP.get('auto.test.full')?.defaultValue).toBe(true)
    expect(PREF_KEY_MAP.get('auto.consolidateSpecs.quick')?.defaultValue).toBe(true)
    expect(PREF_KEY_MAP.get('auto.cleanCode.full')?.defaultValue).toBe(false)
    expect(PREF_KEY_MAP.get('auto.runTasks.quick')?.defaultValue).toBe(true)
    expect(PREF_KEY_MAP.get('auto.runTasks.full')?.defaultValue).toBe(false)
    expect(PREF_KEY_MAP.get('auto.gitPush')?.defaultValue).toBe(false)
    expect(PREF_KEY_MAP.get('auto.knowledgeSave.quick')?.defaultValue).toBe(true)
    expect(PREF_KEY_MAP.get('auto.eval.proposal')?.defaultValue).toBe(true)
    expect(PREF_KEY_MAP.get('auto.eval.prd')?.defaultValue).toBe(false)
    expect(PREF_KEY_MAP.get('auto.eval.uiDesign')?.defaultValue).toBe(true)
    expect(PREF_KEY_MAP.get('auto.eval.techDesign')?.defaultValue).toBe(false)
    // coverage.*(config.go CoverageConfigDefaults)
    expect(PREF_KEY_MAP.get('coverage.coding.feature')?.defaultValue).toEqual({ type: 'percentage', percentage: 80 })
    expect(PREF_KEY_MAP.get('coverage.coding.enhancement')?.defaultValue).toEqual({ type: 'percentage', percentage: 60 })
    expect(PREF_KEY_MAP.get('coverage.coding.fix')?.defaultValue).toEqual({ type: 'percentage', percentage: 60 })
    expect(PREF_KEY_MAP.get('coverage.coding.refactor')?.defaultValue).toEqual({ type: 'maintain' })
    expect(PREF_KEY_MAP.get('coverage.coding.cleanup')?.defaultValue).toEqual({ type: 'maintain' })
    // eval.*(config_auto.go EvalSettingsDefaults — rubric frontmatter)
    expect(PREF_KEY_MAP.get('eval.ui.target')?.defaultValue).toBe(950)
    expect(PREF_KEY_MAP.get('eval.journey.target')?.defaultValue).toBe(850)
    expect(PREF_KEY_MAP.get('eval.contract.target')?.defaultValue).toBe(850)
    expect(PREF_KEY_MAP.get('eval.consistency.iterations')?.defaultValue).toBe(3)
    // worktree.* 无 Go 默认
    expect(PREF_KEY_MAP.get('worktree.source-branch')?.defaultValue).toBeUndefined()
    expect(PREF_KEY_MAP.get('worktree.includes')?.defaultValue).toBeUndefined()
  })

  it('exposes type metadata per key (boolean/number/text/list/coverage + control)', () => {
    expect(PREF_KEY_MAP.get('auto.gitPush')).toMatchObject({ type: 'boolean', control: 'toggle', group: 'auto' })
    expect(PREF_KEY_MAP.get('eval.prd.target')).toMatchObject({ type: 'number', control: 'number-input', group: 'eval' })
    expect(PREF_KEY_MAP.get('worktree.source-branch')).toMatchObject({ type: 'text', control: 'text-input', group: 'worktree' })
    expect(PREF_KEY_MAP.get('worktree.includes')).toMatchObject({ type: 'list', control: 'text-input', group: 'worktree' })
    expect(PREF_KEY_MAP.get('coverage.coding.feature')).toMatchObject({ type: 'coverage', control: 'coverage-input', group: 'coverage' })
  })

  it('answers ERR_PREF_KEY_UNKNOWN outside the closed set', () => {
    expectPrefCode(() => requireKnownPrefKey('surfaces'), 'ERR_PREF_KEY_UNKNOWN')
    expectPrefCode(() => requireKnownPrefKey('logs.level'), 'ERR_PREF_KEY_UNKNOWN')
    expectPrefCode(() => requireKnownPrefKey('auto.test'), 'ERR_PREF_KEY_UNKNOWN') // 非叶键
    expectPrefCode(() => requireKnownPrefKey('coverage.coding.nope'), 'ERR_PREF_KEY_UNKNOWN')
    expect(requireKnownPrefKey('auto.gitPush').type).toBe('boolean')
  })

  it('normalizes values per type and rejects violations with ERR_PREF_VALUE_INVALID', () => {
    const def = (key: string): PrefKeyDefinition => PREF_KEY_MAP.get(key) as PrefKeyDefinition
    // boolean
    expect(normalizePrefValue(def('auto.gitPush'), true)).toBe(true)
    expectPrefCode(() => normalizePrefValue(def('auto.gitPush'), 'yes'), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('auto.gitPush'), 1), 'ERR_PREF_VALUE_INVALID')
    // number:整数域内放行,越界拒绝
    expect(normalizePrefValue(def('eval.prd.target'), 900)).toBe(900)
    expect(normalizePrefValue(def('eval.prd.target'), 0)).toBe(0)
    expectPrefCode(() => normalizePrefValue(def('eval.prd.target'), 1.5), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('eval.prd.target'), -1), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('eval.prd.target'), 1201), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('eval.prd.iterations'), 11), 'ERR_PREF_VALUE_INVALID')
    // text(分支名可含 `/`;仅拒空串与控制字符)
    expect(normalizePrefValue(def('worktree.source-branch'), ' main ')).toBe('main')
    expect(normalizePrefValue(def('worktree.source-branch'), 'release/1.0')).toBe('release/1.0')
    expectPrefCode(() => normalizePrefValue(def('worktree.source-branch'), '  '), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('worktree.source-branch'), 'bad\u0007'), 'ERR_PREF_VALUE_INVALID')
    // list:逗号分隔文本面(UI 约定)+ 数组面;空集拒绝(清除走 clear)
    expect(normalizePrefValue(def('worktree.includes'), 'docs/, pkgs ,')).toEqual(['docs/', 'pkgs'])
    expect(normalizePrefValue(def('worktree.includes'), ['a', ' b '])).toEqual(['a', 'b'])
    expectPrefCode(() => normalizePrefValue(def('worktree.includes'), ' , '), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('worktree.includes'), ['a', 2]), 'ERR_PREF_VALUE_INVALID')
    // coverage:数字面(CLI set 同形)/ 'maintain' / 结构面;百分比域 [0,100]
    expect(normalizePrefValue(def('coverage.coding.feature'), 75)).toEqual({ type: 'percentage', percentage: 75 })
    expect(normalizePrefValue(def('coverage.coding.feature'), 'maintain')).toEqual({ type: 'maintain' })
    expect(normalizePrefValue(def('coverage.coding.feature'), { type: 'percentage', percentage: 65 })).toEqual({ type: 'percentage', percentage: 65 })
    expectPrefCode(() => normalizePrefValue(def('coverage.coding.feature'), 101), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('coverage.coding.feature'), { type: 'percentage' }), 'ERR_PREF_VALUE_INVALID')
    expectPrefCode(() => normalizePrefValue(def('coverage.coding.feature'), { type: 'bogus' }), 'ERR_PREF_VALUE_INVALID')
  })
})

// ---------------------------------------------------------------------------
// scope addressing (qualified feature address + project existence)
// ---------------------------------------------------------------------------

describe('pref scope addressing', () => {
  it('parses the qualified feature address and rejects malformed forms', () => {
    expect(parseFeatureScopeId('p-1/alpha')).toEqual({ projectId: 'p-1', featureSlug: 'alpha' })
    expectPrefCode(() => parseFeatureScopeId('alpha'), 'ERR_PREF_SCOPE_INVALID')
    expectPrefCode(() => parseFeatureScopeId('a/b/c'), 'ERR_PREF_SCOPE_INVALID')
    expectPrefCode(() => parseFeatureScopeId('p-1/'), 'ERR_PREF_SCOPE_INVALID')
  })

  it('builds the three-tier chain most-specific first', async () => {
    await withPrefsDb((_service, _db, _events, projects) => {
      expect(prefScopeChain(prefScopeAddressOf(_db, 'global'))).toEqual([{ scope: 'global', scopeId: '' }])
      expect(prefScopeChain(prefScopeAddressOf(_db, { project: projects.p1 }))).toEqual([
        { scope: 'project', scopeId: projects.p1 },
        { scope: 'global', scopeId: '' },
      ])
      expect(prefScopeChain(prefScopeAddressOf(_db, { feature: `${projects.p1}/alpha` }))).toEqual([
        { scope: 'feature', scopeId: `${projects.p1}/alpha` },
        { scope: 'project', scopeId: projects.p1 },
        { scope: 'global', scopeId: '' },
      ])
    })
  })

  it('requires a registered project (ERR_PROJECT_NOT_FOUND) and valid scope forms', async () => {
    await withPrefsDb((service, _db, _events, _projects) => {
      expectPrefCode(() => service.getPrefs({ project: 'ghost' } as never), 'ERR_PROJECT_NOT_FOUND')
      expectPrefCode(() => service.getPrefs({ feature: 'ghost/alpha' }), 'ERR_PROJECT_NOT_FOUND')
      expectPrefCode(() => service.getPrefs({ feature: 'no-slash' }), 'ERR_PREF_SCOPE_INVALID')
      expectPrefCode(() => service.getPrefs({ feature: 'a/b/c' }), 'ERR_PREF_SCOPE_INVALID')
      expectPrefCode(() => service.getPrefs('team' as never), 'ERR_PREF_SCOPE_INVALID')
    })
  })
})

// ---------------------------------------------------------------------------
// AC-1 + AC-3: three-tier resolution matrix over the real store
// ---------------------------------------------------------------------------

describe('prefs three-tier resolution (AC-1)', () => {
  it('answers the registry projection with defaults when nothing is set', async () => {
    await withPrefsDb((service, _db, _events, _projects) => {
      const rows = service.getPrefs('global')
      expect(rows).toHaveLength(38)
      expect(rowOf(rows, 'auto.test.full')).toMatchObject({ value: true, source: 'default', override: false, localValue: null })
      expect(rowOf(rows, 'eval.ui.target')).toMatchObject({ value: 950, source: 'default' })
      expect(rowOf(rows, 'coverage.coding.feature')).toMatchObject({ value: { type: 'percentage', percentage: 80 }, source: 'default' })
      // worktree 无默认:source=null / value=null(未覆盖态,UI 呈空输入)
      expect(rowOf(rows, 'worktree.source-branch')).toMatchObject({ value: null, source: null, override: false })
    })
  })

  it('lower tiers inherit an upper-tier-only setting (global-only and project-only)', async () => {
    await withPrefsDb((service, _db, _events, projects) => {
      service.setPrefs('global', [{ key: 'auto.gitPush', value: true }])
      // project / feature 查询:继承 global 生效值
      expect(rowOf(service.getPrefs({ project: projects.p1 }), 'auto.gitPush')).toMatchObject({ value: true, source: 'global', override: false })
      expect(rowOf(service.getPrefs({ feature: `${projects.p1}/alpha` }), 'auto.gitPush')).toMatchObject({ value: true, source: 'global', override: false })
      // global 查询:本级覆盖
      expect(rowOf(service.getPrefs('global'), 'auto.gitPush')).toMatchObject({ value: true, source: 'global', override: true, localValue: true })

      service.setPrefs({ project: projects.p2 }, [{ key: 'eval.prd.target', value: 950 }])
      // 项目级设置:feature 继承;global 不受影响(default 900)
      expect(rowOf(service.getPrefs({ feature: `${projects.p2}/beta` }), 'eval.prd.target')).toMatchObject({ value: 950, source: 'project', override: false })
      expect(rowOf(service.getPrefs('global'), 'eval.prd.target')).toMatchObject({ value: 900, source: 'default' })
    })
  })

  it('overrides level by level: feature beats project beats global', async () => {
    await withPrefsDb((service, _db, _events, projects) => {
      const feature = { feature: `${projects.p1}/alpha` }
      service.setPrefs('global', [{ key: 'auto.test.quick', value: true }])
      service.setPrefs({ project: projects.p1 }, [{ key: 'auto.test.quick', value: false }])
      expect(rowOf(service.getPrefs(feature), 'auto.test.quick')).toMatchObject({ value: false, source: 'project' })
      service.setPrefs(feature, [{ key: 'auto.test.quick', value: true }])
      expect(rowOf(service.getPrefs(feature), 'auto.test.quick')).toMatchObject({ value: true, source: 'feature', override: true, localValue: true })
      // 项目级视图:本级覆盖 false(不被 feature 级反向影响)
      expect(rowOf(service.getPrefs({ project: projects.p1 }), 'auto.test.quick')).toMatchObject({ value: false, source: 'project', override: true })
      // 全局视图:本级覆盖 true
      expect(rowOf(service.getPrefs('global'), 'auto.test.quick')).toMatchObject({ value: true, source: 'global', override: true })
    })
  })

  it('keeps the qualified feature address from colliding across same-slug projects', async () => {
    await withPrefsDb((service, _db, _events, projects) => {
      service.setPrefs({ feature: `${projects.p1}/alpha` }, [{ key: 'worktree.source-branch', value: 'release/1.0' }])
      // p-2 同名 feature:不继承 p-1 的 feature 级行(worktree 无默认 → null)
      expect(rowOf(service.getPrefs({ feature: `${projects.p2}/alpha` }), 'worktree.source-branch')).toMatchObject({ value: null, source: null, override: false })
      // 项目隔离:p-2 项目级不继承 p-1 feature 级
      service.setPrefs({ project: projects.p1 }, [{ key: 'auto.gitPush', value: true }])
      expect(rowOf(service.getPrefs({ project: projects.p2 }), 'auto.gitPush')).toMatchObject({ value: false, source: 'default', override: false })
    })
  })

  it('clearPrefOverride falls the effective value back to the next tier (AC-3)', async () => {
    await withPrefsDb((service, _db, _events, projects) => {
      const feature = { feature: `${projects.p1}/alpha` }
      service.setPrefs('global', [{ key: 'eval.journey.target', value: 1000 }])
      service.setPrefs({ project: projects.p1 }, [{ key: 'eval.journey.target', value: 900 }])
      service.setPrefs(feature, [{ key: 'eval.journey.target', value: 850 }])
      expect(rowOf(service.getPrefs(feature), 'eval.journey.target')).toMatchObject({ value: 850, source: 'feature' })

      service.clearPrefOverride(feature, 'eval.journey.target') // → project 900
      expect(rowOf(service.getPrefs(feature), 'eval.journey.target')).toMatchObject({ value: 900, source: 'project', override: false })
      service.clearPrefOverride({ project: projects.p1 }, 'eval.journey.target') // → global 1000
      expect(rowOf(service.getPrefs(feature), 'eval.journey.target')).toMatchObject({ value: 1000, source: 'global' })
      service.clearPrefOverride('global', 'eval.journey.target') // → 注册表默认 850
      expect(rowOf(service.getPrefs(feature), 'eval.journey.target')).toMatchObject({ value: 850, source: 'default' })
    })
  })

  it('stores normalized shapes (list array / coverage strategy) readable via getPrefs', async () => {
    await withPrefsDb((service, _db, _events, projects) => {
      service.setPrefs({ project: projects.p1 }, [
        { key: 'worktree.includes', value: 'docs/ , packages/plugins ' },
        { key: 'coverage.coding.refactor', value: 70 },
        { key: 'coverage.coding.feature', value: 'maintain' },
      ])
      const rows = service.getPrefs({ project: projects.p1 })
      expect(rowOf(rows, 'worktree.includes')).toMatchObject({ value: ['docs/', 'packages/plugins'], source: 'project', override: true })
      expect(rowOf(rows, 'coverage.coding.refactor')).toMatchObject({ value: { type: 'percentage', percentage: 70 } })
      expect(rowOf(rows, 'coverage.coding.feature')).toMatchObject({ value: { type: 'maintain' } })
    })
  })

  it('exposes the effective-value map for the presynthesis consumer (resolveEffectiveValues)', async () => {
    await withPrefsDb((service, db, _events, projects) => {
      service.setPrefs('global', [{ key: 'auto.gitPush', value: true }])
      const effective = resolveEffectiveValues(db, { feature: `${projects.p1}/alpha` })
      expect(effective['auto.gitPush']).toBe(true)
      expect(effective['coverage.coding.feature']).toEqual({ type: 'percentage', percentage: 80 })
      expect(effective['eval.proposal.iterations']).toBe(3)
      expect('worktree.source-branch' in effective).toBe(false) // 无默认无设置 → 不出现
    })
  })
})

// ---------------------------------------------------------------------------
// AC-2 + AC-3: validation + transactional writes
// ---------------------------------------------------------------------------

describe('setPrefs validation and atomicity (AC-2/AC-3)', () => {
  it('rejects unknown keys and type violations before any write lands', async () => {
    await withPrefsDb((service, db, _events, projects) => {
      expectPrefCode(() => service.setPrefs('global', [{ key: 'auto.test', value: true }]), 'ERR_PREF_KEY_UNKNOWN')
      expectPrefCode(() => service.setPrefs('global', [{ key: 'surfaces', value: 'api' }]), 'ERR_PREF_KEY_UNKNOWN')
      expectPrefCode(() => service.setPrefs({ project: projects.p1 }, [{ key: 'auto.gitPush', value: 'nope' }]), 'ERR_PREF_VALUE_INVALID')
      // 三表全空(零写入)
      const count = db.prepare('SELECT COUNT(*) AS n FROM prefs').get() as { n: number }
      expect(count.n).toBe(0)
    })
  })

  it('rolls the whole batch back when a later entry is invalid (no half writes)', async () => {
    await withPrefsDb((service, db, _events, _projects) => {
      expectPrefCode(() => service.setPrefs('global', [
        { key: 'auto.gitPush', value: true }, // 合法先行
        { key: 'eval.prd.target', value: 9999 }, // 域越界
      ]), 'ERR_PREF_VALUE_INVALID')
      const count = db.prepare('SELECT COUNT(*) AS n FROM prefs').get() as { n: number }
      expect(count.n).toBe(0)
    })
  })

  it('rolls back mid-write failures via the SAVEPOINT transaction', async () => {
    await withPrefsDb((_service, db, _events, _projects) => {
      // 第二次 prefs INSERT 失败的注入面:wrap prepare,首条写入后断言回滚。
      // (proxy get 返回的函数一律 bind 到真 db —— node:sqlite 方法以 receiver
      // 判界,未绑定时报 Illegal invocation。)
      let inserts = 0
      const failingDb: DatabaseSyncLike = new Proxy(db, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver)
          if (typeof value !== 'function') return value
          if (prop !== 'prepare') return value.bind(target)
          const prepare = value as DatabaseSyncLike['prepare']
          return ((sql: string) => {
            const statement = prepare.call(target, sql)
            if (sql.includes('INSERT INTO prefs')) {
              inserts += 1
              if (inserts === 2) {
                return {
                  get: (...args: unknown[]) => statement.get(...args),
                  all: (...args: unknown[]) => statement.all(...args),
                  run: () => { throw new Error('injected mid-write failure') },
                }
              }
            }
            return statement
          }).bind(target)
        },
      })
      const failing = createPrefsVerbService({ db: failingDb })
      expect(() => failing.setPrefs('global', [
        { key: 'auto.gitPush', value: true },
        { key: 'eval.prd.target', value: 910 },
      ])).toThrow('injected mid-write failure')
      expect(inserts).toBe(2)
      // 第一条已写入的行被 SAVEPOINT 回滚:零半写
      const count = db.prepare('SELECT COUNT(*) AS n FROM prefs').get() as { n: number }
      expect(count.n).toBe(0)
    })
  })

  it('upserts atomically across keys and rewrites an existing override', async () => {
    await withPrefsDb((service, _db, _events, _projects) => {
      service.setPrefs('global', [
        { key: 'auto.gitPush', value: true },
        { key: 'eval.prd.target', value: 920 },
      ])
      service.setPrefs('global', [{ key: 'auto.gitPush', value: false }]) // 覆写同键
      const rows = service.getPrefs('global')
      expect(rowOf(rows, 'auto.gitPush')).toMatchObject({ value: false, override: true })
      expect(rowOf(rows, 'eval.prd.target')).toMatchObject({ value: 920 })
    })
  })

  it('clearPrefOverride guards the key set and stays an idempotent no-op', async () => {
    await withPrefsDb((service, _db, events, _projects) => {
      expectPrefCode(() => service.clearPrefOverride('global', 'auto.test'), 'ERR_PREF_KEY_UNKNOWN')
      events.length = 0
      service.clearPrefOverride('global', 'auto.gitPush') // 无行:幂等 no-op
      expect(events).toHaveLength(0)
      service.setPrefs('global', [{ key: 'auto.gitPush', value: true }])
      events.length = 0
      service.clearPrefOverride('global', 'auto.gitPush')
      expect(events).toEqual([{ type: 'prefs_updated', scope: 'global', scopeId: '' }])
      expect(rowOf(service.getPrefs('global'), 'auto.gitPush')).toMatchObject({ value: false, source: 'default', override: false })
    })
  })
})

// ---------------------------------------------------------------------------
// prefs_updated events + batcher coalescing
// ---------------------------------------------------------------------------

describe('prefs_updated events', () => {
  it('fires per changed write with the scope address payload', async () => {
    await withPrefsDb((service, _db, events, projects) => {
      service.setPrefs('global', [{ key: 'auto.gitPush', value: true }])
      service.setPrefs({ project: projects.p1 }, [{ key: 'eval.prd.target', value: 950 }])
      service.setPrefs({ feature: `${projects.p1}/alpha` }, [{ key: 'auto.gitPush', value: true }])
      service.setPrefs('global', []) // 空批:no-op,无事件
      expect(events).toEqual([
        { type: 'prefs_updated', scope: 'global', scopeId: '' },
        { type: 'prefs_updated', scope: 'project', scopeId: 'p-1' },
        { type: 'prefs_updated', scope: 'feature', scopeId: 'p-1/alpha' },
      ])
    })
  })

  it('coalesces same-address events inside one batch window', () => {
    const delivered: WorkbenchEvent[][] = []
    const sink: WorkbenchEventSink = batch => delivered.push([...batch])
    const batcher = createEventBatcher(sink, { batchWindowMs: 10_000 })
    batcher.push([{ type: 'prefs_updated', scope: 'global', scopeId: '' }])
    batcher.push([{ type: 'prefs_updated', scope: 'global', scopeId: '' }])
    batcher.push([{ type: 'prefs_updated', scope: 'project', scopeId: 'p-1' }])
    expect(batcher.pendingCount).toBe(2)
    batcher.flush()
    expect(delivered).toEqual([[
      { type: 'prefs_updated', scope: 'global', scopeId: '' },
      { type: 'prefs_updated', scope: 'project', scopeId: 'p-1' },
    ]])
    batcher.dispose()
  })
})

// ---------------------------------------------------------------------------
// IPC face: channel routing + scope shape validation + envelope mapping
// ---------------------------------------------------------------------------

const OWNED: WorkbenchVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }

describe('prefs IPC verbs (routing, shapes, envelope)', () => {
  it('maps each prefs verb onto exactly one whitelisted channel', () => {
    expect(WORKBENCH_VERB_CHANNELS.getPrefs).toBe('dsh-forge:workbench-get-prefs')
    expect(WORKBENCH_VERB_CHANNELS.setPrefs).toBe('dsh-forge:workbench-set-prefs')
    expect(WORKBENCH_VERB_CHANNELS.clearPrefOverride).toBe('dsh-forge:workbench-clear-pref-override')
    for (const channel of [WORKBENCH_VERB_CHANNELS.getPrefs, WORKBENCH_VERB_CHANNELS.setPrefs, WORKBENCH_VERB_CHANNELS.clearPrefOverride]) {
      expect(isWhitelistedWorkbenchVerbChannel(channel)).toBe(true)
    }
  })

  /** withInstalledVerbs 回调形态(登记后的动词面 + 服务面)。 */
  interface InstalledVerbsRun {
    (handlers: Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>,
      service: PrefsVerbService): void | Promise<void>
  }

  async function withInstalledVerbs(run: InstalledVerbsRun): Promise<void> {
    await withPrefsDb((service, _db, _events, _projects) => {
      const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
      const registrar: WorkbenchHandleRegistrar = (channel, listener) => { handlers.set(channel, listener) }
      const services = {
        getPrefs: service.getPrefs.bind(service),
        setPrefs: service.setPrefs.bind(service),
        clearPrefOverride: service.clearPrefOverride.bind(service),
      } as unknown as WorkbenchVerbServices
      installWorkbenchVerbs(registrar, services, { sink: () => {}, subscribe: () => {}, unsubscribe: () => {}, size: 0 })
      return run(handlers, service)
    })
  }

  it('routes the three verbs with the parsed scope and entries', async () => {
    await withInstalledVerbs((handlers) => {
      handlers.get(WORKBENCH_VERB_CHANNELS.getPrefs)?.(OWNED, { feature: 'p-1/alpha' })
      expect(handlers.get(WORKBENCH_VERB_CHANNELS.setPrefs)?.(OWNED, { project: 'p-1' }, [{ key: 'auto.gitPush', value: true }]))
      handlers.get(WORKBENCH_VERB_CHANNELS.clearPrefOverride)?.(OWNED, 'global', 'auto.gitPush')
      // 路由即达:内核侧产物经 getPrefs 读回验证(非 mock 断言,真装配)
      const rows = handlers.get(WORKBENCH_VERB_CHANNELS.getPrefs)?.(OWNED, { project: 'p-1' }) as { key: string; override: boolean }[]
      expect(rows.find(row => row.key === 'auto.gitPush')?.override).toBe(true)
    })
  })

  it('rejects malformed scope and entry shapes before the service', async () => {
    await withInstalledVerbs((handlers) => {
      const invoke = (channel: string, ...args: unknown[]): unknown => {
        try {
          return handlers.get(channel)?.(OWNED, ...args)
        } catch (error) {
          return error
        }
      }
      for (const bad of ['team', { project: 'p-1', feature: 'p-1/alpha' }, { }, 42]) {
        expect(String((invoke(WORKBENCH_VERB_CHANNELS.getPrefs, bad) as Error).message)).toContain('scope must be')
      }
      expect(String((invoke(WORKBENCH_VERB_CHANNELS.setPrefs, 'global', 'nope') as Error).message)).toContain('entries must be an array')
      expect(String((invoke(WORKBENCH_VERB_CHANNELS.setPrefs, 'global', [{ value: true }]) as Error).message)).toContain('entries[0].key')
      expect(String((invoke(WORKBENCH_VERB_CHANNELS.clearPrefOverride, 'global') as Error).message)).toContain('key')
    })
  })

  it('maps domain rejections onto the serialized ERR_PREF_* envelope', async () => {
    await withInstalledVerbs((handlers) => {
      const capture = (fn: () => unknown): { message: string } => {
        try {
          fn()
        } catch (error) {
          return error as { message: string }
        }
        throw new Error('expected a rejection')
      }
      const unknownKey = capture(() => handlers.get(WORKBENCH_VERB_CHANNELS.setPrefs)?.(OWNED, 'global', [{ key: 'nope', value: 1 }]))
      expect(JSON.parse(unknownKey.message)).toEqual({
        code: 'ERR_PREF_KEY_UNKNOWN',
        message: expect.stringContaining('nope'),
      })
      const badValue = capture(() => handlers.get(WORKBENCH_VERB_CHANNELS.setPrefs)?.(OWNED, 'global', [{ key: 'auto.gitPush', value: 1 }]))
      expect(JSON.parse(badValue.message).code).toBe('ERR_PREF_VALUE_INVALID')
      const missingProject = capture(() => handlers.get(WORKBENCH_VERB_CHANNELS.getPrefs)?.(OWNED, { project: 'ghost' }))
      expect(JSON.parse(missingProject.message).code).toBe('ERR_PROJECT_NOT_FOUND')
    })
  })
})
