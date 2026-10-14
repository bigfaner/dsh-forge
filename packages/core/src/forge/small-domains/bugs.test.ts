// fix-bug 第五小域测试——bugs 域三法（registerBug/resolveBug/listBugs）+ git 解析径单测钉住
// （身份 = git config user.name 缺席回退 user.email；证据 = worktree list --porcelain
// HEAD==hash 反查未命中回退 branch --contains）。git 访问经 execFile 注入（git-lookup.ts
// 同口径——受控成败桩同签名零特判），测试不依赖真实 git 二进制。
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { BugCard } from '@dsh-forge/contracts'
import { createBugsService, type BugsServiceDeps, type GitExecFile } from './bugs.js'
import { ReasonRequiredError } from './errors.js'
import { createHarness, type SmallDomainHarness } from './harness.js'

/** 受控 execFile 桩：按 (args join ' ') 前缀映射 stdout/失败；记录调用形状供断言 */
function stubExecFile(script: Record<string, string | null>): { execFile: GitExecFile; calls: string[] } {
  const calls: string[] = []
  const execFile: GitExecFile = (_cmd, args, _opts, cb) => {
    const key = args.join(' ')
    calls.push(key)
    const out = script[key]
    if (out === null || out === undefined) {
      const err = Object.assign(new Error(`git ${key} failed`), { code: 1 }) as Error & { code?: number }
      cb(err, '', '')
      return
    }
    cb(null, out, '')
  }
  return { execFile, calls }
}

/** 种 task 行（source_task_id FK 真值锚——bugs.source_task_id REFERENCES tasks(id)） */
function seedTask(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, mode, created_at, updated_at)
     VALUES (?, 'fix-bug', '1', '任务 1', 'coding-fix', 'completed', 'proposal', 'fix-bug', 'blitz', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(id)
}

const PORCELAIN_HIT = [
  'worktree Z:/repo/main',
  'HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'branch refs/heads/main',
  '',
  'worktree Z:/repo/wt-fix',
  'HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'branch refs/heads/fix/login-500',
  '',
].join('\n')

/** 装配同构注入：resolveWsPath = 夹具 wsDir（生产 routing.wsPath 同径）；git 桩可换装 */
function makeService(
  h: SmallDomainHarness,
  git?: Partial<Pick<BugsServiceDeps, 'execFile'>>,
) {
  return createBugsService({
    store: h.store,
    events: h.events,
    resolveWsPath: () => h.wsDir,
    ...git,
  })
}

const REGISTER_BASE = {
  summary: '登录接口偶发 500',
  bugDesc: '登录接口空 body 时必现 500',
  triggerDesc: 'POST /login 空 body',
  expected: '400 参数错误',
  actual: '500 内部错误',
}

async function registerOpen(
  h: SmallDomainHarness,
  git?: Partial<Pick<BugsServiceDeps, 'execFile'>>,
  extra: Record<string, string> = {},
): Promise<BugCard> {
  return makeService(h, git).registerBug({ projectId: h.projectId, ...REGISTER_BASE, ...extra })
}

describe('registerBug：open 行写入 + 身份解析径', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('AC1 写 open 行：五字段 + 可空 error_type/source_task_id + report_session_id + reporter（user.name 解析）+ 事件', async () => {
    h = createHarness()
    seedTask(h.wsDb, 'task-uuid-1')
    const { execFile, calls } = stubExecFile({ 'config user.name': 'faner' })
    const bug = await registerOpen(h, { execFile }, {
      suspected: 'apps/host/auth.ts:88',
      errorType: 'api',
      sourceTaskId: 'task-uuid-1',
      reportSessionId: 'sess-1',
    })
    expect(calls).toEqual(['config user.name'])
    expect(bug.bugStatus).toBe('open')
    expect(bug.summary).toBe('登录接口偶发 500')
    expect(bug.bugDesc).toBe(REGISTER_BASE.bugDesc)
    expect(bug.triggerDesc).toBe(REGISTER_BASE.triggerDesc)
    expect(bug.expected).toBe(REGISTER_BASE.expected)
    expect(bug.actual).toBe(REGISTER_BASE.actual)
    expect(bug.suspected).toBe('apps/host/auth.ts:88')
    expect(bug.errorType).toBe('api')
    expect(bug.sourceTaskId).toBe('task-uuid-1')
    expect(bug.reportSessionId).toBe('sess-1')
    expect(bug.reporter).toBe('faner')
    expect(bug.commitHash).toBeUndefined()
    expect(bug.unresolvedReason).toBeUndefined()
    expect(bug.updatedAt).toBe(bug.createdAt)
    // 可空字段缺席 = 键缺席（lossless JSON——tool 返回面合规）
    const bare = await registerOpen(h, { execFile })
    expect('suspected' in bare).toBe(false)
    expect('errorType' in bare).toBe(false)
    expect('sourceTaskId' in bare).toBe(false)
    // 写后事件（子 tab 刷新依赖——同四域 emit 模式）
    expect(h.events.emitted).toEqual([{ projectId: h.projectId }, { projectId: h.projectId }])
  })

  it('AC1 summary ≤50 字超长拒写（51 字拒绝 + 行不在库 + 零事件）', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({ 'config user.name': 'faner' })
    const long = '四'.repeat(51)
    await expect(makeService(h, { execFile }).registerBug({ projectId: h.projectId, ...REGISTER_BASE, summary: long }))
      .rejects.toMatchObject({ code: 'ERR_BUG_SUMMARY_TOO_LONG' })
    const db = h.store.ensureOpen(h.projectId)
    expect(db.prepare('SELECT COUNT(*) AS n FROM bugs').get()).toEqual({ n: 0 })
    expect(h.events.emitted).toEqual([])
    // 恰 50 字放行（全角汉字按码点计——字即字）
    await makeService(h, { execFile }).registerBug({ projectId: h.projectId, ...REGISTER_BASE, summary: '四'.repeat(50) })
  })

  it('AC1 身份解析径钉住：user.name 缺席回退 user.email（回退序单测）', async () => {
    h = createHarness()
    const { execFile, calls } = stubExecFile({ 'config user.name': null, 'config user.email': 'f@e.co' })
    const bug = await registerOpen(h, { execFile })
    expect(calls).toEqual(['config user.name', 'config user.email'])
    expect(bug.reporter).toBe('f@e.co')
  })

  it('AC1 身份解析径钉住：双缺席 fail-soft 回退占位（git 可选依赖——不拒写）', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({ 'config user.name': null, 'config user.email': null })
    const bug = await registerOpen(h, { execFile })
    expect(bug.reporter).toBe('(unknown)')
  })
})

describe('resolveBug：终态回填 + hash 锚定反查径 + 状态机', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('AC2 fixed：commit_hash 入参 + porcelain HEAD==hash 反查 worktree/branch + fixer + fix_session_id', async () => {
    h = createHarness()
    const { execFile, calls } = stubExecFile({
      'config user.name': 'faner',
      'worktree list --porcelain': PORCELAIN_HIT,
    })
    const s = makeService(h, { execFile })
    const open = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE, reportSessionId: 'sess-r' })
    const fixed = await s.resolveBug({
      projectId: h.projectId,
      bugId: open.bugId,
      outcome: 'fixed',
      commitHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      fixSessionId: 'sess-f',
    })
    // 反查径：porcelain 匹配 HEAD==hash（大小写/空白不敏感锚）→ worktree + 短分支名
    expect(calls.filter((c) => c.startsWith('worktree'))).toEqual(['worktree list --porcelain'])
    expect(fixed.bugStatus).toBe('fixed')
    expect(fixed.commitHash).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(fixed.worktree).toBe('Z:/repo/wt-fix')
    expect(fixed.branch).toBe('fix/login-500')
    expect(fixed.fixer).toBe('faner')
    expect(fixed.fixSessionId).toBe('sess-f')
    expect(fixed.reporter).toBe('faner')
    expect(fixed.reportSessionId).toBe('sess-r')
    expect(fixed.updatedAt >= fixed.createdAt).toBe(true)
    expect(h.events.emitted.length).toBe(2)
  })

  it('AC2 反查径回退钉住：porcelain 未命中 → branch --contains 反查 branch、worktree 置空', async () => {
    h = createHarness()
    const { execFile, calls } = stubExecFile({
      'config user.name': 'faner',
      'worktree list --porcelain': PORCELAIN_HIT, // 只含 aa/bb——cc 未命中
      'branch --contains cccccccccccccccccccccccccccccccccccccccc': '* fix/after-advance\n',
    })
    const s = makeService(h, { execFile })
    const open = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE })
    const fixed = await s.resolveBug({
      projectId: h.projectId,
      bugId: open.bugId,
      outcome: 'fixed',
      commitHash: 'cccccccccccccccccccccccccccccccccccccccc',
    })
    expect(calls).toContain('branch --contains cccccccccccccccccccccccccccccccccccccccc')
    expect(fixed.branch).toBe('fix/after-advance')
    expect(fixed.worktree).toBeUndefined()
    expect(fixed.commitHash).toBe('cccccccccccccccccccccccccccccccccccccccc')
  })

  it('AC2 反查径 fail-soft：git 双径全失败 → 证据缺席不拒写（fixed 行照落）', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({ 'config user.name': null, 'config user.email': 'f@e.co' })
    const s = makeService(h, { execFile })
    const open = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE })
    const fixed = await s.resolveBug({
      projectId: h.projectId,
      bugId: open.bugId,
      outcome: 'fixed',
      commitHash: 'dddddddddddddddddddddddddddddddddddddddd',
    })
    expect(fixed.branch).toBeUndefined()
    expect(fixed.worktree).toBeUndefined()
    expect(fixed.fixer).toBe('f@e.co')
    expect(fixed.bugStatus).toBe('fixed')
  })

  it('AC3 unresolved：unresolved_reason 落行；缺因拒绝（ERR_REASON_REQUIRED）', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({ 'config user.name': 'faner' })
    const s = makeService(h, { execFile })
    const open = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE })
    await expect(
      s.resolveBug({ projectId: h.projectId, bugId: open.bugId, outcome: 'unresolved', unresolvedReason: '  ' }),
    ).rejects.toBeInstanceOf(ReasonRequiredError)
    const un = await s.resolveBug({
      projectId: h.projectId,
      bugId: open.bugId,
      outcome: 'unresolved',
      unresolvedReason: '仅 release 构建出现',
    })
    expect(un.bugStatus).toBe('unresolved')
    expect(un.unresolvedReason).toBe('仅 release 构建出现')
    expect(un.commitHash).toBeUndefined()
  })

  it('AC3 状态机 open→fixed｜unresolved 单向：终态再迁移拒绝（ERR_BUG_ALREADY_RESOLVED）', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({
      'config user.name': 'faner',
      'worktree list --porcelain': PORCELAIN_HIT,
    })
    const s = makeService(h, { execFile })
    const a = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE })
    await s.resolveBug({ projectId: h.projectId, bugId: a.bugId, outcome: 'fixed', commitHash: 'b'.repeat(40) })
    await expect(
      s.resolveBug({ projectId: h.projectId, bugId: a.bugId, outcome: 'fixed', commitHash: 'b'.repeat(40) }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_ALREADY_RESOLVED' })
    await expect(
      s.resolveBug({ projectId: h.projectId, bugId: a.bugId, outcome: 'unresolved', unresolvedReason: 'x' }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_ALREADY_RESOLVED' })
    const b = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE })
    await s.resolveBug({ projectId: h.projectId, bugId: b.bugId, outcome: 'unresolved', unresolvedReason: 'y' })
    await expect(
      s.resolveBug({ projectId: h.projectId, bugId: b.bugId, outcome: 'fixed', commitHash: 'a'.repeat(40) }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_ALREADY_RESOLVED' })
  })

  it('fixed 缺 commit_hash 拒写；bugId 未命中 404（校验先于写）', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({ 'config user.name': 'faner' })
    const s = makeService(h, { execFile })
    const open = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE })
    await expect(
      s.resolveBug({ projectId: h.projectId, bugId: open.bugId, outcome: 'fixed' }),
    ).rejects.toMatchObject({ code: 'ERR_COMMIT_HASH_REQUIRED' })
    await expect(
      s.resolveBug({ projectId: h.projectId, bugId: 'nope', outcome: 'fixed', commitHash: 'a'.repeat(40) }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_NOT_FOUND' })
    expect(h.events.emitted.length).toBe(1) // 拒绝路径零事件
  })
})

describe('listBugs：search（summary/error_type/状态中文标签）+ status 过滤 + sort', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('AC4 服务端承载三面齐备 + searchPlaceholder 同构（标签键命中）', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({
      'config user.name': 'faner',
      'worktree list --porcelain': PORCELAIN_HIT,
    })
    const s = makeService(h, { execFile })
    const b1 = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE, summary: '登录接口 500', errorType: 'api' })
    const b2 = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE, summary: '空分页游标越界', errorType: 'paging' })
    const b3 = await s.registerBug({ projectId: h.projectId, ...REGISTER_BASE, summary: '样式错位', errorType: 'css' })
    await s.resolveBug({ projectId: h.projectId, bugId: b2.bugId, outcome: 'fixed', commitHash: 'b'.repeat(40) })
    await s.resolveBug({ projectId: h.projectId, bugId: b3.bugId, outcome: 'unresolved', unresolvedReason: '不可复现' })
    // 同毫秒注册的行拉开 created_at（排序断言确定性——同刻 id 决胜不在本测）
    const stamp = (id: string, at: string): void => {
      h!.wsDb.prepare('UPDATE bugs SET created_at = ? WHERE id = ?').run(at, id)
    }
    stamp(b1.bugId, '2026-01-01T00:00:00.000Z')
    stamp(b2.bugId, '2026-01-02T00:00:00.000Z')
    stamp(b3.bugId, '2026-01-03T00:00:00.000Z')

    const all = await s.listBugs({ projectId: h.projectId })
    expect(all.map((b) => b.bugId)).toEqual([b1.bugId, b3.bugId, b2.bugId]) // active：open 优先，终态组 created 降序
    expect((await s.listBugs({ projectId: h.projectId, sort: 'created' })).map((b) => b.bugId)).toEqual([
      b3.bugId, b2.bugId, b1.bugId,
    ])
    // search：summary 主行 / error_type / 状态中文标签（待修复 = open）
    expect((await s.listBugs({ projectId: h.projectId, search: '游标' })).map((b) => b.bugId)).toEqual([b2.bugId])
    expect((await s.listBugs({ projectId: h.projectId, search: 'paging' })).map((b) => b.bugId)).toEqual([b2.bugId])
    expect((await s.listBugs({ projectId: h.projectId, search: '待修复' })).map((b) => b.bugId)).toEqual([b1.bugId])
    expect((await s.listBugs({ projectId: h.projectId, search: 'open' })).map((b) => b.bugId)).toEqual([b1.bugId])
    expect(await s.listBugs({ projectId: h.projectId, search: 'zzz' })).toEqual([])
    // status 过滤 chips
    expect((await s.listBugs({ projectId: h.projectId, status: ['open'] })).map((b) => b.bugId)).toEqual([b1.bugId])
    expect(
      (await s.listBugs({ projectId: h.projectId, status: ['fixed', 'unresolved'] })).map((b) => b.bugId).sort(),
    ).toEqual([b2.bugId, b3.bugId].sort())
    expect((await s.listBugs({ projectId: h.projectId, status: [] })).length).toBe(3)
  })
})

describe('commitFiles/fileDiff：fixed 证据变更内容读面（git show 只读；fail-soft 空集/空串）', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('commitFiles：name-status 解析（R 双路径取新路径）；hash 形脏/git 失败 = 空集', async () => {
    h = createHarness()
    const { execFile, calls } = stubExecFile({
      'show --name-status --format= a1b2c3d': 'M\tpackages/core/src/a.ts\nA\tpackages/web/src/b.tsx\nR100\told.ts\tnew.ts',
    })
    const s = makeService(h, { execFile })
    expect(await s.commitFiles({ projectId: h.projectId, commitHash: 'a1b2c3d' })).toEqual([
      { status: 'M', path: 'packages/core/src/a.ts' },
      { status: 'A', path: 'packages/web/src/b.tsx' },
      { status: 'R100', path: 'new.ts' },
    ])
    expect(calls.some((c) => c.startsWith('show --name-status'))).toBe(true)
    // hash 形脏（注入防御）→ 空集且零 git 调用
    const before = calls.length
    expect(await s.commitFiles({ projectId: h.projectId, commitHash: 'bad;rm -rf' })).toEqual([])
    expect(calls.length).toBe(before)
    // git 失败 → 空集 fail-soft
    const fail = stubExecFile({ 'show --name-status --format= deadbeef': null })
    expect(await makeService(h, { execFile: fail.execFile }).commitFiles({ projectId: h.projectId, commitHash: 'deadbeef' })).toEqual([])
  })

  it('fileDiff：单文件 unified diff 原样；path 越界/git 失败 = 空串', async () => {
    h = createHarness()
    const { execFile } = stubExecFile({
      'show --format= a1b2c3d -- packages/core/src/a.ts': 'diff --git a/a.ts b/a.ts\n+line',
    })
    const s = makeService(h, { execFile })
    expect(await s.fileDiff({ projectId: h.projectId, commitHash: 'a1b2c3d', path: 'packages/core/src/a.ts' })).toEqual({
      diff: 'diff --git a/a.ts b/a.ts\n+line',
    })
    expect(await s.fileDiff({ projectId: h.projectId, commitHash: 'a1b2c3d', path: '../escape' })).toEqual({ diff: '' })
    expect(await s.fileDiff({ projectId: h.projectId, commitHash: 'a1b2c3d', path: '/abs/path' })).toEqual({ diff: '' })
    const fail = stubExecFile({})
    expect(await makeService(h, { execFile: fail.execFile }).fileDiff({ projectId: h.projectId, commitHash: 'a1b2c3d', path: 'x' })).toEqual({ diff: '' })
  })
})
