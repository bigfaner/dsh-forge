import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { WORKBENCH_VERB_CHANNELS } from '../src/main/workbench/ipc/channel-allowlist.ts'
import {
  createWorkbenchEventSubscriptions,
  installWorkbenchVerbs,
  toWorkbenchIpcError,
  WorkbenchIpcError,
  type WorkbenchHandleRegistrar,
} from '../src/main/workbench/ipc/handlers.ts'
import { createWorkbenchIpcServices, type WorkbenchPerceptionSeam } from '../src/main/workbench/ipc/services.ts'
import type { WorkbenchVerbEvent } from '../src/main/workbench/ipc/sender-validate.ts'
import type { Project, WorkbenchEvent, WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
import { WorkbenchRegistryError } from '../src/main/workbench/registry/validate.ts'
import { RegisteredProjectExistsError } from '../src/main/workbench/projects/lifecycle-service.ts'
import { WorkbenchRepoError } from '../src/main/workbench/repos/types.ts'
import { registerProjectV3 } from '../src/main/workbench/repos/projects.ts'
import { toComparableKey } from '../src/main/workbench/projects-identity/index.ts'

// 任务 1.3 — M4 v3 IPC 动词面·P1 批(tech-design §Interface 1 v3):
// probeProjectPath / registerProject(v2 入参)/ renameProject /
// archiveProject / restoreProject / removeProject(语义扩展)/ listProjects
// + project_list_changed / projection_push_required(占位)事件。
//
// 两层用例:
//   1. handler 形状面(非法 docsPlacement / 未授权 custom 旗标 / repo-new
//      缺 docsPath / 双形态分发)——fake services + 假登记器;
//   2. 内核语义面(注册成功 / 已注册快车道 / 不可读 / app 派生置备 /
//      custom 授权复检 / 生命周期四操作流转 / list 扩展列 / probe 侦测)
//      ——openDatabase 真 v3 库 + services 装配(onEvents 捕获)。

const OWNED: WorkbenchVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }

function stderrSink(): string[] {
  const lines: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }) as typeof process.stderr.write)
  return lines
}

afterEach(() => {
  vi.restoreAllMocks()
})

function toCapture(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

let scratchCounter = 0
function makeScratch(): string {
  scratchCounter += 1
  const dir = join(tmpdir(), `wb-lifecycle-${Date.now()}-${scratchCounter}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 形状面 harness:fake services + 假 ipcMain.handle 登记器。 */
function installed(services: WorkbenchVerbServices) {
  const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
  const registrar: WorkbenchHandleRegistrar = (channel, listener) => { handlers.set(channel, listener) }
  installWorkbenchVerbs(registrar, services, createWorkbenchEventSubscriptions())
  return handlers
}

function fakeServices(): WorkbenchVerbServices {
  return {
    registerProject: vi.fn(() => ({ id: 'p-1' })),
    probeProjectPath: vi.fn(() => ({ input: '', exists: false })),
    renameProject: vi.fn(() => ({ id: 'p-1' })),
    archiveProject: vi.fn(() => ({ id: 'p-1' })),
    restoreProject: vi.fn(() => ({ id: 'p-1' })),
    listProjects: vi.fn(() => []),
  } as unknown as WorkbenchVerbServices
}

/** 语义面 harness:真 v3 库 + services 装配(事件捕获 + 感知假体)。 */
interface SemanticHarness {
  readonly db: DatabaseSyncLike
  readonly verbs: WorkbenchVerbServices
  readonly events: WorkbenchEvent[]
  readonly userData: string
  readonly docsRoot: string
  makeDir(name: string): string
  dispose(): void
}

async function withSemanticHarness(run: (harness: SemanticHarness) => void | Promise<void>): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const manifest = join(root, 'resources', 'plugin-bundles.json')
  mkdirSync(join(root, 'resources'), { recursive: true })
  writeFileSync(manifest, JSON.stringify({ bundles: [{ name: '@deepseek-ai/dsh-base', mandatory: true }] }))
  const { db } = await openDatabase(userData)
  const events: WorkbenchEvent[] = []
  const perception: WorkbenchPerceptionSeam = { retarget: () => {}, rescan: () => {} }
  const assembly = createWorkbenchIpcServices({
    db,
    pluginBundlesPath: manifest,
    userDataPath: userData,
    onEvents: batch => events.push(...batch),
    perception,
  })
  const harness: SemanticHarness = {
    db,
    verbs: assembly.verbs,
    events,
    userData,
    docsRoot: join(userData, 'workbench', 'docs'),
    makeDir(name: string): string {
      const dir = join(root, name)
      mkdirSync(dir, { recursive: true })
      return dir
    },
    dispose(): void {
      db.close()
      rmSync(root, { recursive: true, force: true })
    },
  }
  try {
    await run(harness)
  } finally {
    harness.dispose()
  }
}

// ---------------------------------------------------------------------------
// 1. handler 形状面(词汇表 + 必填契约 + 双形态分发)
// ---------------------------------------------------------------------------

describe('v3 verb shape validation (handler layer)', () => {
  it('rejects an out-of-vocabulary docsPlacement before the service', () => {
    stderrSink()
    const services = fakeServices()
    const handlers = installed(services)
    const error = toCapture(() =>
      handlers.get(WORKBENCH_VERB_CHANNELS.registerProject)?.(OWNED, { anchor: 'Z:/demo', docsPlacement: 'elsewhere' }))
    expect(error).toBeInstanceOf(WorkbenchIpcError)
    // 形状错 = 调用方契约错 → ERR_WORKBENCH_DB 兜底封装,原文在 detail。
    expect(toWorkbenchIpcError(error, 'registerProject').envelope.detail)
      .toMatch(/docsPlacement must be one of repo-existing\/repo-new\/app\/custom/)
    expect(services.registerProject).not.toHaveBeenCalled()
  })

  it('rejects custom without the explicit authorization flag (BIZ-001/003 收窄)', () => {
    stderrSink()
    const services = fakeServices()
    const handlers = installed(services)
    const missing = toCapture(() =>
      handlers.get(WORKBENCH_VERB_CHANNELS.registerProject)?.(OWNED, {
        anchor: 'Z:/demo', docsPlacement: 'custom', docsPath: 'Z:/docs/demo',
      }))
    expect(toWorkbenchIpcError(missing, 'registerProject').envelope.detail).toMatch(/customAuthorized must be true/)
    const false_ = toCapture(() =>
      handlers.get(WORKBENCH_VERB_CHANNELS.registerProject)?.(OWNED, {
        anchor: 'Z:/demo', docsPlacement: 'custom', docsPath: 'Z:/docs/demo', customAuthorized: false,
      }))
    expect(toWorkbenchIpcError(false_, 'registerProject').envelope.detail).toMatch(/customAuthorized must be true/)
    expect(services.registerProject).not.toHaveBeenCalled()
  })

  it('rejects repo-new / custom without docsPath, and a non-boolean customAuthorized', () => {
    stderrSink()
    const services = fakeServices()
    const handlers = installed(services)
    const noPath = toCapture(() =>
      handlers.get(WORKBENCH_VERB_CHANNELS.registerProject)?.(OWNED, { anchor: 'Z:/demo', docsPlacement: 'repo-new' }))
    expect(toWorkbenchIpcError(noPath, 'registerProject').envelope.detail).toMatch(/docsPath is required when docsPlacement is repo-new/)
    const badFlag = toCapture(() =>
      handlers.get(WORKBENCH_VERB_CHANNELS.registerProject)?.(OWNED, {
        anchor: 'Z:/demo', docsPlacement: 'custom', docsPath: 'Z:/docs/demo', customAuthorized: 'yes' as unknown as boolean,
      }))
    expect(toWorkbenchIpcError(badFlag, 'registerProject').envelope.detail).toMatch(/customAuthorized must be a boolean/)
    // v1 face stays untouched: the M2/M3 wizard input still routes.
    handlers.get(WORKBENCH_VERB_CHANNELS.registerProject)?.(OWNED, { codeRoot: 'Z:/demo', docLocationType: 'in_repo' })
    expect(services.registerProject).toHaveBeenCalledWith({ codeRoot: 'Z:/demo', docLocationType: 'in_repo' })
  })

  it('rejects empty anchor / missing projectId / empty displayName on the new verbs', () => {
    stderrSink()
    const services = fakeServices()
    const handlers = installed(services)
    expect(toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.registerProject)?.(OWNED, { docsPlacement: 'app' })))
      .toBeInstanceOf(WorkbenchIpcError)
    expect(toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.probeProjectPath)?.(OWNED, { path: '' })))
      .toBeInstanceOf(WorkbenchIpcError)
    expect(toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.renameProject)?.(OWNED, { projectId: 'p-1', displayName: '' })))
      .toBeInstanceOf(WorkbenchIpcError)
    expect(toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.archiveProject)?.(OWNED, {})))
      .toBeInstanceOf(WorkbenchIpcError)
    expect(services.renameProject).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. 内核语义面(动词矩阵:注册成功 / 已注册快车道 / 不可读 / custom 复检 /
//    app 派生 / 生命周期流转 / list 扩展列 / probe)
// ---------------------------------------------------------------------------

describe('registerProject v2 kernel chain (task 1.3)', () => {
  it('registers with the v3 columns and emits projection_push_required (placeholder) + project_list_changed', async () => {
    await withSemanticHarness(({ verbs, events, makeDir }) => {
      const anchor = makeDir('demo-repo')
      const project = verbs.registerProject({ anchor, docsPlacement: 'repo-existing' }) as Project

      expect(project.docsPlacement).toBe('repo-existing')
      expect(project.docLocationType).toBe('in_repo')
      expect(project.docLocationPath).toBeNull()
      expect(project.archived).toBe(false)
      expect(project.sortOrder).toBe(0)
      expect(project.projectionState).toBe('pending')
      // canonical 展示路径:正斜杠 + 真实大小写(realpath.native)。
      expect(project.codeRoot.replaceAll('\\', '/')).toBe(project.codeRoot)
      expect(project.codeRoot.endsWith('/demo-repo')).toBe(true)
      // 缺省显示名 = 文件夹名。
      expect(project.displayName).toBe('demo-repo')

      const second = verbs.registerProject({
        anchor: makeDir('second-repo'), displayName: '  ', docsPlacement: 'repo-existing',
      }) as Project
      expect(second.sortOrder).toBe(1)
      expect(second.displayName).toBe('second-repo') // 空白 displayName 回退缺省

      // 事件序:projection_push_required(占位 plan)→ project_list_changed。
      expect(events).toEqual([
        {
          type: 'projection_push_required',
          projectId: project.id,
          plan: { projectId: project.id, ops: [{ kind: 'ensure', canonicalPath: project.codeRoot, title: 'demo-repo' }] },
        },
        { type: 'project_list_changed' },
        {
          type: 'projection_push_required',
          projectId: second.id,
          plan: { projectId: second.id, ops: [{ kind: 'ensure', canonicalPath: second.codeRoot, title: 'second-repo' }] },
        },
        { type: 'project_list_changed' },
      ])
    })
  })

  it('ERR_PROJECT_EXISTS carries the registered fast-lane payload across the three identity tiers', async () => {
    await withSemanticHarness(({ verbs, db, makeDir }) => {
      const anchor = makeDir('dup-repo')
      const project = verbs.registerProject({ anchor, docsPlacement: 'repo-existing' }) as Project

      // —— tier 1 canonical:同路径再注册。 ——
      const same = toCapture(() => verbs.registerProject({ anchor, docsPlacement: 'app' }))
      expect(same).toBeInstanceOf(RegisteredProjectExistsError)
      expect((same as RegisteredProjectExistsError).code).toBe('ERR_PROJECT_EXISTS')
      expect(JSON.parse((same as RegisteredProjectExistsError).detail)).toEqual({
        projectId: project.id,
        displayName: project.displayName,
        codeRoot: project.codeRoot,
        tier: 'canonical',
      })

      // —— tier 2 pathKey:悬挂键(存储 canonical ≠ probe canonical,折叠键
      //    相等 = 同目录异写法注册过)。种子行走 v3 存储函数(键 = probe 面
      //    折叠键,UNIQUE 唯一占位)。 ——
      const anchor2 = makeDir('dup-by-key')
      const probe2 = verbs.probeProjectPath({ path: anchor2 })
      expect(probe2.registered).toBeNull()
      registerProjectV3(db, {
        codeRoot: 'Z:/ghost/hanging-key',
        codeRootKey: probe2.pathKey as string,
        identityDev: null,
        identityIno: null,
        identityVerified: 0,
        displayName: 'hanging',
        docLocationType: 'in_repo',
        docLocationPath: null,
        docsPlacement: 'repo-existing',
        customAuthorized: false,
      })
      const byKey = toCapture(() => verbs.registerProject({ anchor: anchor2, docsPlacement: 'repo-existing' }))
      expect(byKey).toBeInstanceOf(RegisteredProjectExistsError)
      expect(JSON.parse((byKey as RegisteredProjectExistsError).detail)).toMatchObject({ tier: 'pathKey' })

      // —— tier 3 physical (dev,ino):项目搬家后悬挂键 + 物理位仲裁。 ——
      const anchor3 = makeDir('dup-by-identity')
      const probe3 = verbs.probeProjectPath({ path: anchor3 })
      expect(probe3.identity).not.toBeNull()
      registerProjectV3(db, {
        codeRoot: 'Z:/ghost/moved-away',
        codeRootKey: 'Z:/GHOST/MOVED-AWAY-UNRELATED',
        identityDev: probe3.identity?.dev ?? null,
        identityIno: probe3.identity?.ino ?? null,
        identityVerified: 1,
        displayName: 'moved',
        docLocationType: 'in_repo',
        docLocationPath: null,
        docsPlacement: 'repo-existing',
        customAuthorized: false,
      })
      const byPhysical = toCapture(() => verbs.registerProject({ anchor: anchor3, docsPlacement: 'repo-existing' }))
      expect(byPhysical).toBeInstanceOf(RegisteredProjectExistsError)
      expect(JSON.parse((byPhysical as RegisteredProjectExistsError).detail)).toMatchObject({ tier: 'physical' })

      // 命中即仲裁回写自愈:悬挂行 identity_* / code_root 按 fresh probe 回填。
      const healed = db.prepare('SELECT code_root, identity_dev, identity_ino FROM projects WHERE display_name = ?')
        .get('moved') as { code_root: string; identity_dev: string | null; identity_ino: string | null }
      expect(healed.identity_dev).toBe(probe3.identity?.dev ?? null)
      expect(healed.identity_ino).toBe(probe3.identity?.ino ?? null)
      expect(healed.code_root).toBe(verbs.probeProjectPath({ path: anchor3 }).canonicalPath)
    })
  })

  it('ERR_CODE_ROOT_UNREADABLE: missing path / file entry / relative / bare drive', async () => {
    await withSemanticHarness(({ verbs, makeDir }) => {
      const missing = toCapture(() => verbs.registerProject({ anchor: join(makeDir('hole'), 'gone'), docsPlacement: 'repo-existing' }))
      expect(missing).toBeInstanceOf(WorkbenchRegistryError)
      expect((missing as WorkbenchRegistryError).code).toBe('ERR_CODE_ROOT_UNREADABLE')

      const file = join(makeDir('file-holder'), 'plain.txt')
      writeFileSync(file, 'x')
      const notDir = toCapture(() => verbs.registerProject({ anchor: file, docsPlacement: 'repo-existing' }))
      expect((notDir as WorkbenchRegistryError).code).toBe('ERR_CODE_ROOT_UNREADABLE')

      const relative = toCapture(() => verbs.registerProject({ anchor: 'relative/path', docsPlacement: 'repo-existing' }))
      expect((relative as WorkbenchRegistryError).code).toBe('ERR_CODE_ROOT_UNREADABLE')

      const bare = toCapture(() => verbs.registerProject({ anchor: 'Z:', docsPlacement: 'repo-existing' }))
      expect((bare as WorkbenchRegistryError).code).toBe('ERR_CODE_ROOT_UNREADABLE')
    })
  })

  it('repo-new: docsPath is the declared in-repo slot; storage stays the standard in_repo location', async () => {
    await withSemanticHarness(({ verbs, makeDir }) => {
      const anchor = makeDir('new-tree')
      const project = verbs.registerProject({
        anchor, docsPlacement: 'repo-new', docsPath: `${anchor.replaceAll('\\', '/')}/docs`,
      }) as Project
      expect(project.docsPlacement).toBe('repo-new')
      expect(project.docLocationType).toBe('in_repo')
      expect(project.docLocationPath).toBeNull()
    })
  })

  it('app: kernel-derived <docsRoot>/<folder> is provisioned and stored external', async () => {
    await withSemanticHarness(({ verbs, docsRoot, makeDir }) => {
      const anchor = makeDir('app-managed')
      const project = verbs.registerProject({ anchor, docsPlacement: 'app' }) as Project
      const expected = join(docsRoot, 'app-managed').replaceAll('\\', '/')
      expect(project.docsPlacement).toBe('app')
      expect(project.docLocationType).toBe('external')
      expect(project.docLocationPath).toBe(expected)
      // 派生即置备(应用管理空间 mkdir,幂等)。
      expect(existsSync(join(docsRoot, 'app-managed'))).toBe(true)
    })
  })

  it('custom: authorization recheck (narrowed ERR_EXTERNAL_PATH_UNREADABLE) + readability + conflict', async () => {
    await withSemanticHarness(({ verbs, db, makeDir }) => {
      const anchor = makeDir('custom-docs-repo')
      const customDocs = makeDir('custom-docs-target')

      // 旗标在而授权记录不在 → 复检拒绝(先授权后探测,未授权路径连探测都不做)。
      const unauthorized = toCapture(() => verbs.registerProject({
        anchor, docsPlacement: 'custom', docsPath: customDocs, customAuthorized: true,
      }))
      expect(unauthorized).toBeInstanceOf(WorkbenchRegistryError)
      expect((unauthorized as WorkbenchRegistryError).code).toBe('ERR_EXTERNAL_PATH_UNREADABLE')
      expect((unauthorized as WorkbenchRegistryError).message).toMatch(/no explicit authorization/)

      // 授权在案 → 通过(同一入参)。
      verbs.authorizeExternalDocPath(customDocs)
      const project = verbs.registerProject({
        anchor, docsPlacement: 'custom', docsPath: customDocs, customAuthorized: true,
      }) as Project
      expect(project.docsPlacement).toBe('custom')
      expect(project.docLocationType).toBe('external')

      // docsPath 指向不可读目标 → 复检拒绝(新 anchor,避开唯一性短路)。
      const ghostPath = join(makeDir('ghost-holder'), 'missing')
      verbs.authorizeExternalDocPath(ghostPath)
      const unreadable = toCapture(() => verbs.registerProject({
        anchor: makeDir('unreadable-repo'), docsPlacement: 'custom', docsPath: ghostPath, customAuthorized: true,
      }))
      expect((unreadable as WorkbenchRegistryError).code).toBe('ERR_EXTERNAL_PATH_UNREADABLE')
      expect((unreadable as WorkbenchRegistryError).message).toMatch(/not a readable directory/)

      // docsPath = 本项目 anchor → 冲突拒绝(registry 单源比对)。
      const conflictAnchor = makeDir('conflict-repo')
      verbs.authorizeExternalDocPath(conflictAnchor)
      const conflict = toCapture(() => verbs.registerProject({
        anchor: conflictAnchor, docsPlacement: 'custom', docsPath: conflictAnchor, customAuthorized: true,
      }))
      expect((conflict as WorkbenchRegistryError).code).toBe('ERR_DOC_PATH_CONFLICT')
      expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toMatchObject({ n: 1 })
    })
  })
})

describe('lifecycle verbs + listProjects (task 1.3)', () => {
  it('rename is pure DB (zero fs/perception); archive/restore flip only the archived bit; remove cascades + notifies', async () => {
    await withSemanticHarness(({ verbs, events, makeDir }) => {
      const project = verbs.registerProject({ anchor: makeDir('lifecycle-a'), docsPlacement: 'repo-existing' }) as Project
      events.length = 0

      // rename:纯 DB 零 fs(显示名变更;感知面不触发)。
      const renamed = verbs.renameProject({ projectId: project.id, displayName: '  renamed  ' }) as Project
      expect(renamed.displayName).toBe('renamed')

      // archive / restore:仅 archived 位。
      const archived = verbs.archiveProject({ projectId: project.id }) as Project
      expect(archived.archived).toBe(true)
      const restored = verbs.restoreProject({ projectId: project.id }) as Project
      expect(restored.archived).toBe(false)

      // 三个操作各发一条 project_list_changed。
      expect(events.filter(event => event.type === 'project_list_changed').length).toBe(3)

      // remove:DB 删除(FK cascade 由 schema 承载)+ 列表变更事件;
      // 重复 remove → ERR_PROJECT_NOT_FOUND。
      events.length = 0
      verbs.removeProject(project.id)
      expect(verbs.listProjects()).toEqual([])
      expect(events).toEqual([{ type: 'project_list_changed' }])
      const gone = toCapture(() => verbs.removeProject(project.id))
      expect(gone).toBeInstanceOf(WorkbenchRepoError)
      expect((gone as WorkbenchRepoError).code).toBe('ERR_PROJECT_NOT_FOUND')

      // 未知 id 的生命周期动词统一 ERR_PROJECT_NOT_FOUND。
      for (const capture of [
        () => verbs.renameProject({ projectId: 'ghost', displayName: 'x' }),
        () => verbs.archiveProject({ projectId: 'ghost' }),
        () => verbs.restoreProject({ projectId: 'ghost' }),
      ]) {
        const error = toCapture(capture)
        expect(error).toBeInstanceOf(WorkbenchRepoError)
        expect((error as WorkbenchRepoError).code).toBe('ERR_PROJECT_NOT_FOUND')
      }
    })
  })

  it('listProjects returns the v3 extended columns in registration order', async () => {
    await withSemanticHarness(({ verbs, makeDir }) => {
      const a = verbs.registerProject({ anchor: makeDir('order-a'), docsPlacement: 'repo-existing' }) as Project
      const b = verbs.registerProject({ anchor: makeDir('order-b'), docsPlacement: 'app' }) as Project
      verbs.archiveProject({ projectId: b.id })

      const rows = verbs.listProjects()
      expect(rows.map(row => row.id)).toEqual([a.id, b.id])
      expect(rows[0]).toMatchObject({
        archived: false, sortOrder: 0, projectionState: 'pending', docsPlacement: 'repo-existing',
      })
      expect(rows[1]).toMatchObject({
        archived: true, sortOrder: 1, projectionState: 'pending', docsPlacement: 'app',
      })
      // getState 同源投影(same repo single source)。
      expect(verbs.getState().projects.map(row => row.id)).toEqual([a.id, b.id])
    })
  })
})

describe('probeProjectPath verb (task 1.3)', () => {
  it('answers the DetectReport with the registered fast lane; degrades quietly for bad paths', async () => {
    await withSemanticHarness(({ verbs, makeDir }) => {
      const anchor = makeDir('probe-repo')
      const project = verbs.registerProject({ anchor, docsPlacement: 'repo-existing' }) as Project

      const hit = verbs.probeProjectPath({ path: anchor })
      expect(hit.exists).toBe(true)
      expect(hit.isDir).toBe(true)
      expect(hit.readable).toBe(true)
      expect(hit.pathKey).toBe(toComparableKey(anchor))
      expect(hit.registered).toEqual({ projectId: project.id, displayName: project.displayName })

      const miss = verbs.probeProjectPath({ path: join(anchor, 'gone') })
      expect(miss.exists).toBe(false)
      expect(miss.registered).toBeNull()

      const rejected = verbs.probeProjectPath({ path: 'relative/path' })
      expect(rejected.pathKey).toBeNull()
      expect(rejected.exists).toBe(false)
    })
  })
})
