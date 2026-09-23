import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import {
  authorizeExternalDocPath,
  EXTERNAL_DOC_AUTHORIZATIONS_KEY,
  isExternalDocPathAuthorized,
  listExternalDocAuthorizations,
} from '../src/main/workbench/registry/authorize.ts'
import { detectForgeCheckout } from '../src/main/workbench/registry/forge-detect.ts'
import { registerProject, updateProject, WorkbenchRegistryError } from '../src/main/workbench/registry/validate.ts'
import { listProjects } from '../src/main/workbench/repos/projects.ts'
import { WorkbenchRepoError, type Project } from '../src/main/workbench/repos/types.ts'

// Task 2.4 — registration validation chain over the repos from task 2.2.
// Design: docs/features/dsh-forge-m2/design/tech-design.md (§Error Types &
// Codes — the four registry codes; §Security T4 — external-path authorization;
// §Interfaces Interface 1 — registerProject/updateProject semantics).
//
// Fixture discipline: code roots / doc locations are REAL scratch directories —
// the chain's contract is read-only fs probing, so probing must run against the
// actual filesystem (no CLI on PATH is involved anywhere in this spec).
//
// Hard Rule checks embedded: unauthorized external paths are rejected before any
// fs probe of them (authorization error even for nonexistent paths); every
// rejection leaves the projects table untouched.

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-registry-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

async function withDb(run: (db: DatabaseSyncLike) => void | Promise<void>): Promise<void> {
  const { db } = await openDatabase(makeScratch())
  try {
    await run(db)
  } finally {
    db.close()
  }
}

/** Capture a sync throw for structured assertions (repos-spec pattern). */
function capture(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function expectRegistryError(error: unknown, code: string, messagePattern: RegExp): WorkbenchRegistryError {
  expect(error).toBeInstanceOf(WorkbenchRegistryError)
  const registryError = error as WorkbenchRegistryError
  expect(registryError.code).toBe(code)
  expect(registryError.message).toMatch(messagePattern)
  return registryError
}

function expectPlainError(error: unknown, messagePattern: RegExp): void {
  expect(error).toBeInstanceOf(Error)
  expect(error).not.toBeInstanceOf(WorkbenchRegistryError)
  expect((error as Error).message).toMatch(messagePattern)
}

/** Distinct-timestamp helper: real clock, 3ms apart keeps ISO ordering stable. */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 3))

/** Normalized form of a scratch path (forward slashes, no trailing slash). */
function normalized(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

/** A scratch code root with a `.forge` directory (forge 检出最小形态)。 */
function makeForgeRepo(): string {
  const dir = join(makeScratch(), 'repo')
  mkdirSync(join(dir, '.forge'), { recursive: true })
  return dir
}

/** A scratch code root detected via `docs/features` only (no `.forge`). */
function makeDocsOnlyRepo(): string {
  const dir = join(makeScratch(), 'repo')
  mkdirSync(join(dir, 'docs', 'features'), { recursive: true })
  return dir
}

/** A plain scratch directory with no forge data at all. */
function makeBareDir(): string {
  const dir = join(makeScratch(), 'repo')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** A scratch external doc base (authorized + forge docs inside). */
function makeExternalDocs(): string {
  const dir = join(makeScratch(), 'external-docs')
  mkdirSync(join(dir, 'docs', 'features'), { recursive: true })
  return dir
}

function findProject(db: DatabaseSyncLike, id: string): Project | undefined {
  return listProjects(db).find(project => project.id === id)
}

// ---------------------------------------------------------------------------
// 合法注册(AC1/AC2 正路径)
// ---------------------------------------------------------------------------

describe('registerProject — 合法注册 (AC1/AC2)', () => {
  it('registers an in_repo forge repo (.forge present) with DTO defaults and a normalized code root', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const project = registerProject(db, { codeRoot: `${normalized(repo)}/`, docLocationType: 'in_repo' })
      expect(project.codeRoot).toBe(normalized(repo))
      expect(project.displayName).toBe('repo')
      expect(project.docLocationType).toBe('in_repo')
      expect(project.docLocationPath).toBeNull()
      expect(findProject(db, project.id)?.docLocationPath).toBeNull()
    })
  })

  it('detects a forge checkout via docs/features alone — no forge CLI, no .forge (AC1)', async () => {
    await withDb((db) => {
      const repo = makeDocsOnlyRepo()
      const project = registerProject(db, { codeRoot: repo, docLocationType: 'in_repo' })
      expect(project.id).toBeTruthy()
      expect(listProjects(db)).toHaveLength(1)
    })
  })

  it('registers an authorized external doc location with the path normalized', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const external = makeExternalDocs()
      authorizeExternalDocPath(db, `${external}/`)
      const project = registerProject(db, {
        codeRoot: repo,
        docLocationType: 'external',
        docLocationPath: `${external}/`,
      })
      expect(project.docLocationType).toBe('external')
      expect(project.docLocationPath).toBe(normalized(external))
    })
  })
})

// ---------------------------------------------------------------------------
// 拒绝路径 1:非 forge 检出(AC1)
// ---------------------------------------------------------------------------

describe('registerProject — 非 forge 检出 → ERR_FORGE_NOT_DETECTED (AC1)', () => {
  it('rejects a bare directory, naming both missing probes and the code root; nothing persisted', async () => {
    await withDb((db) => {
      const bare = makeBareDir()
      const error = capture(() => registerProject(db, { codeRoot: bare, docLocationType: 'in_repo' }))
      expectRegistryError(error, 'ERR_FORGE_NOT_DETECTED', /no forge data detected/)
      const message = (error as WorkbenchRegistryError).message
      expect(message).toContain('.forge directory')
      expect(message).toContain('docs/features')
      expect(message).toContain(normalized(bare))
      expect(listProjects(db)).toEqual([])
    })
  })

  it('a bare code root with an authorized but forge-less external base is equally undetected', async () => {
    await withDb((db) => {
      const bare = makeBareDir()
      const external = join(makeScratch(), 'empty-external')
      mkdirSync(external, { recursive: true })
      authorizeExternalDocPath(db, external)
      const error = capture(() => registerProject(db, { codeRoot: bare, docLocationType: 'external', docLocationPath: external }))
      expectRegistryError(error, 'ERR_FORGE_NOT_DETECTED', /no forge data detected/)
      expect((error as WorkbenchRegistryError).message).toContain('docs/features')
      expect(listProjects(db)).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// 拒绝路径 2:仓外未授权 / 不可读(AC2/AC4;Hard Rule:未授权零 fs 探测)
// ---------------------------------------------------------------------------

describe('registerProject — external 授权与可读性 (AC2/AC4)', () => {
  it('rejects an unauthorized external path BEFORE probing it — even a nonexistent path yields the authorization error (Hard Rule)', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const never = join(makeScratch(), 'never-authorized')
      const error = capture(() => registerProject(db, { codeRoot: repo, docLocationType: 'external', docLocationPath: never }))
      expectRegistryError(error, 'ERR_EXTERNAL_PATH_UNREADABLE', /no explicit authorization/)
      expect((error as WorkbenchRegistryError).message).toContain(normalized(never))
      expect(listProjects(db)).toEqual([])
    })
  })

  it('rejects an authorized but unreadable external path with the path and reason in the message', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const ghost = join(makeScratch(), 'ghost-docs')
      authorizeExternalDocPath(db, ghost) // authorization recording is fs-free by design
      const error = capture(() => registerProject(db, { codeRoot: repo, docLocationType: 'external', docLocationPath: ghost }))
      expectRegistryError(error, 'ERR_EXTERNAL_PATH_UNREADABLE', /is not a readable directory \(does not exist\)/)
      expect((error as WorkbenchRegistryError).message).toContain(normalized(ghost))
      expect(listProjects(db)).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// 拒绝路径 3:冲突码(AC3)
// ---------------------------------------------------------------------------

describe('registerProject — 冲突码 ERR_PROJECT_EXISTS / ERR_DOC_PATH_CONFLICT (AC3)', () => {
  it('a duplicate code root (trailing-slash variant) → ERR_PROJECT_EXISTS via the repos UNIQUE mapping', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      registerProject(db, { codeRoot: repo, docLocationType: 'in_repo' })
      const error = capture(() => registerProject(db, { codeRoot: `${normalized(repo)}/`, docLocationType: 'in_repo' }))
      expect(error).toBeInstanceOf(WorkbenchRepoError)
      expect((error as WorkbenchRepoError).code).toBe('ERR_PROJECT_EXISTS')
      expect(listProjects(db)).toHaveLength(1)
    })
  })

  it('external doc location equal to its own code root → ERR_DOC_PATH_CONFLICT', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      authorizeExternalDocPath(db, repo)
      const error = capture(() => registerProject(db, { codeRoot: repo, docLocationType: 'external', docLocationPath: repo }))
      expectRegistryError(error, 'ERR_DOC_PATH_CONFLICT', /must not equal its own code root/)
    })
  })

  it('external doc location equal to another project’s code root → ERR_DOC_PATH_CONFLICT (checked before authorization)', async () => {
    await withDb((db) => {
      const first = makeForgeRepo()
      registerProject(db, { codeRoot: first, docLocationType: 'in_repo' })
      const second = makeForgeRepo()
      // deliberately NOT authorized: the conflict check must fire without any fs/auth gate
      const error = capture(() => registerProject(db, { codeRoot: second, docLocationType: 'external', docLocationPath: first }))
      expectRegistryError(error, 'ERR_DOC_PATH_CONFLICT', /conflicts with the registered code root/)
      expect(listProjects(db)).toHaveLength(1)
    })
  })

  it('external doc location equal to another project’s external doc path (variant spelling) → ERR_DOC_PATH_CONFLICT', async () => {
    await withDb((db) => {
      const shared = makeExternalDocs()
      authorizeExternalDocPath(db, shared)
      const first = registerProject(db, { codeRoot: makeForgeRepo(), docLocationType: 'external', docLocationPath: shared })
      expect(first.docLocationPath).toBe(normalized(shared))
      const error = capture(() =>
        registerProject(db, { codeRoot: makeForgeRepo(), docLocationType: 'external', docLocationPath: `${normalized(shared)}/` }),
      )
      expectRegistryError(error, 'ERR_DOC_PATH_CONFLICT', /conflicts with the registered external doc location/)
      expect(listProjects(db)).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// 拒绝路径 4:code_root 不可读(AC4)
// ---------------------------------------------------------------------------

describe('registerProject — code_root 不可读 → ERR_CODE_ROOT_UNREADABLE (AC4)', () => {
  it('nonexistent path → error message carries the path and "does not exist"', async () => {
    await withDb((db) => {
      const missing = join(makeScratch(), 'missing-root')
      const error = capture(() => registerProject(db, { codeRoot: missing, docLocationType: 'in_repo' }))
      expectRegistryError(error, 'ERR_CODE_ROOT_UNREADABLE', /is not a readable directory \(does not exist\)/)
      expect((error as WorkbenchRegistryError).message).toContain(normalized(missing))
      expect(listProjects(db)).toEqual([])
    })
  })

  it('a plain file instead of a directory → "not a directory" reason', async () => {
    await withDb((db) => {
      const file = join(makeScratch(), 'not-a-dir')
      writeFileSync(file, 'x')
      const error = capture(() => registerProject(db, { codeRoot: file, docLocationType: 'in_repo' }))
      expectRegistryError(error, 'ERR_CODE_ROOT_UNREADABLE', /is not a readable directory \(not a directory\)/)
    })
  })
})

// ---------------------------------------------------------------------------
// 输入相干性(形状错误,链序 1;行级 CHECK 的前置面)
// ---------------------------------------------------------------------------

describe('registerProject — 输入相干性(链序 1)', () => {
  it('invalid docLocationType / in_repo with a path / external without a path → plain validation errors, nothing persisted', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      expectPlainError(capture(() => registerProject(db, { codeRoot: repo, docLocationType: 'elsewhere' as never })), /invalid docLocationType/)
      expectPlainError(
        capture(() => registerProject(db, { codeRoot: repo, docLocationType: 'in_repo', docLocationPath: 'C:/docs' })),
        /in_repo doc location must not carry docLocationPath/,
      )
      expectPlainError(capture(() => registerProject(db, { codeRoot: repo, docLocationType: 'external' })), /requires a non-empty docLocationPath/)
      expect(listProjects(db)).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// updateProject:重指向走同一校验链(AC5)
// ---------------------------------------------------------------------------

describe('updateProject — 重指向同一校验链 (AC5)', () => {
  it('repoint in_repo → external requires authorization; the row stays untouched on rejection', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const project = registerProject(db, { codeRoot: repo, docLocationType: 'in_repo' })
      const external = makeExternalDocs()
      const error = capture(() => updateProject(db, project.id, { docLocationType: 'external', docLocationPath: external }))
      expectRegistryError(error, 'ERR_EXTERNAL_PATH_UNREADABLE', /no explicit authorization/)
      const after = findProject(db, project.id)
      expect(after?.docLocationType).toBe('in_repo')
      expect(after?.docLocationPath).toBeNull()
    })
  })

  it('repoint succeeds after authorization, normalizes the path, and detection rides on the external docs/features', async () => {
    await withDb((db) => {
      // docs-only code root: after repoint, detection must come from the external base
      const repo = makeDocsOnlyRepo()
      const project = registerProject(db, { codeRoot: repo, docLocationType: 'in_repo' })
      const external = makeExternalDocs()
      authorizeExternalDocPath(db, external)
      const repointed = updateProject(db, project.id, { docLocationType: 'external', docLocationPath: `${normalized(external)}/` })
      expect(repointed.docLocationType).toBe('external')
      expect(repointed.docLocationPath).toBe(normalized(external))
      expect(repointed.displayName).toBe(project.displayName)
    })
  })

  it('repoint external → in_repo succeeds and clears the path', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const external = makeExternalDocs()
      authorizeExternalDocPath(db, external)
      const project = registerProject(db, { codeRoot: repo, docLocationType: 'external', docLocationPath: external })
      const repointed = updateProject(db, project.id, { docLocationType: 'in_repo', docLocationPath: null })
      expect(repointed.docLocationType).toBe('in_repo')
      expect(repointed.docLocationPath).toBeNull()
    })
  })

  it('repoint to a doc location without forge data → ERR_FORGE_NOT_DETECTED (chain includes detection)', async () => {
    await withDb((db) => {
      const repo = makeDocsOnlyRepo() // detection currently via codeRoot docs/features
      const project = registerProject(db, { codeRoot: repo, docLocationType: 'in_repo' })
      const emptyExternal = join(makeScratch(), 'empty-external')
      mkdirSync(emptyExternal, { recursive: true })
      authorizeExternalDocPath(db, emptyExternal)
      const error = capture(() => updateProject(db, project.id, { docLocationType: 'external', docLocationPath: emptyExternal }))
      expectRegistryError(error, 'ERR_FORGE_NOT_DETECTED', /no forge data detected/)
      expect(findProject(db, project.id)?.docLocationType).toBe('in_repo')
    })
  })

  it('repoint onto another project’s doc path → ERR_DOC_PATH_CONFLICT (self is exempt)', async () => {
    await withDb((db) => {
      const shared = makeExternalDocs()
      authorizeExternalDocPath(db, shared)
      const first = registerProject(db, { codeRoot: makeForgeRepo(), docLocationType: 'external', docLocationPath: shared })
      const second = registerProject(db, { codeRoot: makeForgeRepo(), docLocationType: 'in_repo' })
      const error = capture(() => updateProject(db, second.id, { docLocationType: 'external', docLocationPath: shared }))
      expectRegistryError(error, 'ERR_DOC_PATH_CONFLICT', /conflicts with the registered external doc location of project/)
      // self-exemption: repointing the owning project onto its own current path is a no-conflict refresh
      const refreshed = updateProject(db, first.id, { docLocationType: 'external', docLocationPath: `${normalized(shared)}/` })
      expect(refreshed.docLocationPath).toBe(normalized(shared))
    })
  })

  it('rename-only patch skips the fs chain — succeeds even after the code root vanished from disk', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const project = registerProject(db, { codeRoot: repo, docLocationType: 'in_repo' })
      rmSync(repo, { recursive: true, force: true })
      const renamed = updateProject(db, project.id, { displayName: '重命名' })
      expect(renamed.displayName).toBe('重命名')
      expect(renamed.docLocationType).toBe('in_repo')
    })
  })

  it('unknown id → ERR_PROJECT_NOT_FOUND before any probing', async () => {
    await withDb((db) => {
      const error = capture(() => updateProject(db, 'no-such-id', { displayName: 'x' }))
      expect(error).toBeInstanceOf(WorkbenchRepoError)
      expect((error as WorkbenchRepoError).code).toBe('ERR_PROJECT_NOT_FOUND')
    })
  })

  it('incoherent repoint (external without a path) → plain validation error, row untouched', async () => {
    await withDb((db) => {
      const repo = makeForgeRepo()
      const project = registerProject(db, { codeRoot: repo, docLocationType: 'in_repo' })
      const error = capture(() => updateProject(db, project.id, { docLocationType: 'external' }))
      expectPlainError(error, /requires a non-empty docLocationPath/)
      expect(findProject(db, project.id)?.docLocationType).toBe('in_repo')
    })
  })
})

// ---------------------------------------------------------------------------
// authorize:显式授权登记(AC2;Hard Rule 持久化/不可绕过)
// ---------------------------------------------------------------------------

describe('authorize — 显式授权登记 (AC2/Hard Rule)', () => {
  it('persists an authorization; repeated confirm is an idempotent upsert (single entry, refreshed timestamp)', async () => {
    await withDb(async (db) => {
      const external = makeExternalDocs()
      const first = authorizeExternalDocPath(db, `${external}/`)
      expect(isExternalDocPathAuthorized(db, external)).toBe(true)
      expect(listExternalDocAuthorizations(db)).toHaveLength(1)
      await tick()
      const again = authorizeExternalDocPath(db, external)
      expect(listExternalDocAuthorizations(db)).toHaveLength(1)
      expect(again.path).toBe(first.path)
      expect(new Date(again.authorizedAt).getTime()).toBeGreaterThan(new Date(first.authorizedAt).getTime())
    })
  })

  it('normalization equivalence: separator/trailing-slash spellings match one authorization', async () => {
    await withDb((db) => {
      const external = makeExternalDocs()
      authorizeExternalDocPath(db, `${normalized(external)}/`)
      expect(isExternalDocPathAuthorized(db, external)).toBe(true)
      expect(isExternalDocPathAuthorized(db, `${normalized(external)}/`)).toBe(true)
      expect(isExternalDocPathAuthorized(db, join(makeScratch(), 'other'))).toBe(false)
    })
  })

  it('defensive read: a corrupt app_state payload reads as unauthorized without throwing', async () => {
    await withDb((db) => {
      db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?)').run(EXTERNAL_DOC_AUTHORIZATIONS_KEY, '{not json')
      expect(isExternalDocPathAuthorized(db, makeExternalDocs())).toBe(false)
      expect(listExternalDocAuthorizations(db)).toEqual([])
      // and the write path recovers on the next authorization
      const external = makeExternalDocs()
      authorizeExternalDocPath(db, external)
      expect(isExternalDocPathAuthorized(db, external)).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// forge-detect:探测矩阵直接单测(AC1 指标面)
// ---------------------------------------------------------------------------

describe('detectForgeCheckout — 探测矩阵 (AC1)', () => {
  it('both indicators false → not detected; each indicator alone detects; external doc base relocates the docs probe', () => {
    const bare = makeBareDir()
    const docsOnly = makeDocsOnlyRepo()
    const forgeRepo = makeForgeRepo()
    const external = makeExternalDocs()

    const bareResult = detectForgeCheckout({ codeRoot: bare, docLocationPath: null })
    expect(bareResult.detected).toBe(false)
    expect(bareResult.indicators).toEqual({ forgeDir: false, docsFeatures: false })

    expect(detectForgeCheckout({ codeRoot: docsOnly, docLocationPath: null }).indicators).toEqual({
      forgeDir: false,
      docsFeatures: true,
    })
    expect(detectForgeCheckout({ codeRoot: docsOnly, docLocationPath: null }).detected).toBe(true)

    const forgeOnly = detectForgeCheckout({ codeRoot: forgeRepo, docLocationPath: join(makeScratch(), 'elsewhere') })
    expect(forgeOnly.indicators).toEqual({ forgeDir: true, docsFeatures: false })
    expect(forgeOnly.detected).toBe(true)

    // external: docs probe moves to the doc base while .forge stays on the code root
    const externalRelocated = detectForgeCheckout({ codeRoot: bare, docLocationPath: external })
    expect(externalRelocated.indicators).toEqual({ forgeDir: false, docsFeatures: true })
    expect(externalRelocated.probes.docsFeatures.startsWith(external)).toBe(true)
    expect(externalRelocated.probes.forgeDir.startsWith(bare)).toBe(true)
  })
})
