// bugs 域服务测试（plugin-project 1.11 归拢——自 core small-domains/bugs.test.ts 随迁回归，
// 夹具改 project.db DomainDb；语义逐字承袭）：registerBug/resolveBug/listBugs/getBug/
// findRecurrenceCandidates/aggregateByErrorType/commitFiles/fileDiff + git 解析径单测钉住
// （身份 = git config user.name 缺席回退 user.email；证据 = worktree list --porcelain
// HEAD==hash 反查未命中回退 branch --contains）。git 访问经 execFile 注入（受控成败桩同
// 签名零特判），测试不依赖真实 git 二进制。两表制口径差：project.db 无 tasks 表——
// container_slug 登记径恒留空（投影降级），候选归属走 scope.slug 列直比。
import { describe, expect, it } from 'vitest'
import type { BugCard } from '@dsh-forge/contracts'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from '../db/connection.js'
import { createBugsService, ERROR_TYPE_SUGGESTIONS_LIMIT, type GitExecFile } from './service.js'
import { parseTaskContainerSlug } from './recurrence.js'
import { ReasonRequiredError } from './errors.js'

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

/** 装配同构注入：project.db :memory: + 种两项目行 + resolveProjectKey 读行派生（I5 缝）；
 *  onDiag 选填——P1-3 失败路径诊断用例注入收集闭包。 */
function makeFixture(
  git?: Record<string, string | null>,
  onDiag?: (payload: { event: string; level: string; message: string }) => void,
) {
  const domain: DomainDb = openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
  const seedProject = (id: string, projectKey: string): void => {
    domain.repos.projects.insert({
      id,
      projectKey,
      title: id,
      forgeDir: 'Z:\\forge\\x',
      forgeDirExternal: false,
      worktreeDir: '',
      sortOrder: null,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  }
  seedProject('p-1', 'key-1')
  seedProject('p-2', 'key-2')
  const notify: string[] = []
  const stub = stubExecFile(git ?? { 'config user.name': 'faner' })
  const service = createBugsService({
    bugs: domain.repos.bugs,
    resolveProjectKey: (projectId) => domain.repos.projects.get(projectId)?.projectKey ?? null,
    resolveMainPath: () => 'Z:/repo/main',
    execFile: stub.execFile,
    notify: (projectId) => notify.push(projectId),
    ...(onDiag !== undefined ? { onDiag: onDiag as (payload: never) => void } : {}),
  })
  const stampBug = (id: string, patch: { createdAt?: string; updatedAt?: string; suspected?: string | null }): void => {
    const sets: string[] = []
    const vals: Record<string, string | null> = { id }
    if (patch.createdAt !== undefined) { sets.push('created_at = @createdAt'); vals.createdAt = patch.createdAt }
    if (patch.updatedAt !== undefined) { sets.push('updated_at = @updatedAt'); vals.updatedAt = patch.updatedAt }
    if (patch.suspected !== undefined) { sets.push('suspected = @suspected'); vals.suspected = patch.suspected }
    domain.db.prepare(`UPDATE ${domain.tables.bugs} SET ${sets.join(', ')} WHERE id = @id`).run(vals)
  }
  const bugCount = (): number => (domain.db.prepare(`SELECT COUNT(*) AS n FROM ${domain.tables.bugs}`).get() as { n: number }).n
  return { domain, service, notify, calls: stub.calls, projectId: 'p-1', seedProject, stampBug, bugCount }
}

type Fx = ReturnType<typeof makeFixture>

const REGISTER_BASE = {
  summary: '登录接口偶发 500',
  bugDesc: '登录接口空 body 时必现 500',
  triggerDesc: 'POST /login 空 body',
  expected: '400 参数错误',
  actual: '500 内部错误',
}

async function registerOpen(fx: Fx, extra: Record<string, string> = {}): Promise<BugCard> {
  return (await fx.service.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, ...extra })).card
}

describe('registerBug：open 行写入 + 身份解析径 + I5 归属键', () => {
  it('AC1 写 open 行：五字段 + 可空 error_type/source_task_id + report_session_id + reporter（user.name 解析）+ 通知', async () => {
    const fx = makeFixture()
    const bug = await registerOpen(fx, {
      suspected: 'apps/host/auth.ts:88',
      errorType: 'api',
      sourceTaskId: 'task-uuid-1',
      reportSessionId: 'sess-1',
    })
    expect(fx.calls).toEqual(['config user.name'])
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
    // 可空字段缺席 = 键缺席（lossless JSON——tool 返回面合规）；container_slug 无 tasks 反查径 = 恒留空
    const bare = await registerOpen(fx)
    expect('suspected' in bare).toBe(false)
    expect('errorType' in bare).toBe(false)
    expect('sourceTaskId' in bare).toBe(false)
    expect('recurrenceOf' in bare).toBe(false)
    expect('fixer' in bare).toBe(false)
    // 写后通知（子 tab 刷新依赖——装配注入缝）
    expect(fx.notify).toEqual([fx.projectId, fx.projectId])
  })

  it('I5 行级归属键：project_key 派生失败拒写（ERR_BUG_PROJECT_KEY_REQUIRED）——零行零通知', async () => {
    const fx = makeFixture()
    // 未登记项目行（p-ghost）→ 归属解析链派生失败 null
    await expect(fx.service.registerBug({ projectId: 'p-ghost', ...REGISTER_BASE })).rejects.toMatchObject({
      code: 'ERR_BUG_PROJECT_KEY_REQUIRED',
      data: { projectId: 'p-ghost' },
    })
    expect(fx.bugCount()).toBe(0)
    expect(fx.notify).toEqual([])
    // 派生成功（key-2 行）放行——拒写只在派生失败路径
    await expect(fx.service.registerBug({ projectId: 'p-2', ...REGISTER_BASE })).resolves.toBeDefined()
  })

  it('AC1 summary ≤50 字超长拒写（51 字拒绝 + 行不在库 + 零通知）', async () => {
    const fx = makeFixture()
    const long = '四'.repeat(51)
    await expect(fx.service.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: long }))
      .rejects.toMatchObject({ code: 'ERR_BUG_SUMMARY_TOO_LONG' })
    expect(fx.bugCount()).toBe(0)
    expect(fx.notify).toEqual([])
    // 恰 50 字放行（全角汉字按码点计——字即字）
    await fx.service.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '四'.repeat(50) })
  })

  it('AC1 身份解析径钉住：user.name 缺席回退 user.email（回退序单测）', async () => {
    const fx = makeFixture({ 'config user.name': null, 'config user.email': 'f@e.co' })
    const bug = await registerOpen(fx)
    expect(fx.calls).toEqual(['config user.name', 'config user.email'])
    expect(bug.reporter).toBe('f@e.co')
  })

  it('AC1 身份解析径钉住：双缺席 fail-soft 回退占位（git 可选依赖——不拒写）', async () => {
    const fx = makeFixture({ 'config user.name': null, 'config user.email': null })
    const bug = await registerOpen(fx)
    expect(bug.reporter).toBe('(unknown)')
  })
})

describe('resolveBug：终态回填 + hash 锚定反查径 + 状态机', () => {
  it('AC2 fixed：commit_hash 入参 + porcelain HEAD==hash 反查 worktree/branch + fixer + fix_session_id', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const s = fx.service
    const { card: open } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, reportSessionId: 'sess-r' })
    const fixed = await s.resolveBug({
      projectId: fx.projectId,
      bugId: open.bugId,
      outcome: 'fixed',
      commitHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      fixSessionId: 'sess-f',
    })
    // 反查径：porcelain 匹配 HEAD==hash（大小写/空白不敏感锚）→ worktree + 短分支名
    expect(fx.calls.filter((c) => c.startsWith('worktree'))).toEqual(['worktree list --porcelain'])
    expect(fixed.bugStatus).toBe('fixed')
    expect(fixed.commitHash).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(fixed.worktree).toBe('Z:/repo/wt-fix')
    expect(fixed.branch).toBe('fix/login-500')
    expect(fixed.fixer).toBe('faner')
    expect(fixed.fixSessionId).toBe('sess-f')
    expect(fixed.reporter).toBe('faner')
    expect(fixed.reportSessionId).toBe('sess-r')
    expect(fixed.updatedAt >= fixed.createdAt).toBe(true)
    expect(fx.notify.length).toBe(2)
  })

  it('fixed + fix_approach：修复方案总结随终态落行（台账审查面）；缺席 = 键缺席', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const s = fx.service
    const { card: open } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    expect(open.fixApproach).toBeUndefined()
    const fixed = await s.resolveBug({
      projectId: fx.projectId,
      bugId: open.bugId,
      outcome: 'fixed',
      commitHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      fixApproach: '  最小外科修复：反查加任务键前缀判别，回退 updatedAt 启发式  ',
    })
    expect(fixed.fixApproach).toBe('最小外科修复：反查加任务键前缀判别，回退 updatedAt 启发式') // trim 落库
    const absent = await s.resolveBug({
      projectId: fx.projectId,
      bugId: (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '另一登记' })).card.bugId,
      outcome: 'fixed',
      commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
    expect(absent.fixApproach).toBeUndefined() // 缺席回填 = NULL → 键缺席
  })

  it('AC2 反查径回退钉住：porcelain 未命中 → branch --contains 反查 branch、worktree 置空', async () => {
    const fx = makeFixture({
      'config user.name': 'faner',
      'worktree list --porcelain': PORCELAIN_HIT, // 只含 aa/bb——cc 未命中
      'branch --contains cccccccccccccccccccccccccccccccccccccccc': '* fix/after-advance\n',
    })
    const s = fx.service
    const { card: open } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    const fixed = await s.resolveBug({
      projectId: fx.projectId,
      bugId: open.bugId,
      outcome: 'fixed',
      commitHash: 'cccccccccccccccccccccccccccccccccccccccc',
    })
    expect(fx.calls).toContain('branch --contains cccccccccccccccccccccccccccccccccccccccc')
    expect(fixed.branch).toBe('fix/after-advance')
    expect(fixed.worktree).toBeUndefined()
    expect(fixed.commitHash).toBe('cccccccccccccccccccccccccccccccccccccccc')
  })

  it('AC2 反查径 fail-soft：git 双径全失败 → 证据缺席不拒写（fixed 行照落）', async () => {
    const fx = makeFixture({ 'config user.name': null, 'config user.email': 'f@e.co' })
    const s = fx.service
    const { card: open } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    const fixed = await s.resolveBug({
      projectId: fx.projectId,
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
    const fx = makeFixture()
    const s = fx.service
    const { card: open } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    await expect(
      s.resolveBug({ projectId: fx.projectId, bugId: open.bugId, outcome: 'unresolved', unresolvedReason: '  ' }),
    ).rejects.toBeInstanceOf(ReasonRequiredError)
    const un = await s.resolveBug({
      projectId: fx.projectId,
      bugId: open.bugId,
      outcome: 'unresolved',
      unresolvedReason: '仅 release 构建出现',
    })
    expect(un.bugStatus).toBe('unresolved')
    expect(un.unresolvedReason).toBe('仅 release 构建出现')
    expect(un.commitHash).toBeUndefined()
  })

  it('AC3 状态机 open→fixed｜unresolved 单向：终态再迁移拒绝（ERR_BUG_ALREADY_RESOLVED）', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const s = fx.service
    const { card: a } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    await s.resolveBug({ projectId: fx.projectId, bugId: a.bugId, outcome: 'fixed', commitHash: 'b'.repeat(40) })
    await expect(
      s.resolveBug({ projectId: fx.projectId, bugId: a.bugId, outcome: 'fixed', commitHash: 'b'.repeat(40) }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_ALREADY_RESOLVED' })
    await expect(
      s.resolveBug({ projectId: fx.projectId, bugId: a.bugId, outcome: 'unresolved', unresolvedReason: 'x' }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_ALREADY_RESOLVED' })
    const { card: b } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    await s.resolveBug({ projectId: fx.projectId, bugId: b.bugId, outcome: 'unresolved', unresolvedReason: 'y' })
    await expect(
      s.resolveBug({ projectId: fx.projectId, bugId: b.bugId, outcome: 'fixed', commitHash: 'a'.repeat(40) }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_ALREADY_RESOLVED' })
  })

  it('fixed 缺 commit_hash 拒写；bugId 未命中 404（校验先于写）', async () => {
    const fx = makeFixture()
    const s = fx.service
    const { card: open } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    await expect(
      s.resolveBug({ projectId: fx.projectId, bugId: open.bugId, outcome: 'fixed' }),
    ).rejects.toMatchObject({ code: 'ERR_COMMIT_HASH_REQUIRED' })
    await expect(
      s.resolveBug({ projectId: fx.projectId, bugId: 'nope', outcome: 'fixed', commitHash: 'a'.repeat(40) }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_NOT_FOUND' })
    expect(fx.notify.length).toBe(1) // 拒绝路径零通知
  })

  it('单库多项目圈定：他项目 bugId 不穿透（404）', async () => {
    const fx = makeFixture()
    const s = fx.service
    const { card: p2bug } = await s.registerBug({ projectId: 'p-2', ...REGISTER_BASE })
    await expect(s.resolveBug({ projectId: fx.projectId, bugId: p2bug.bugId, outcome: 'unresolved', unresolvedReason: 'x' }))
      .rejects.toMatchObject({ code: 'ERR_BUG_NOT_FOUND' })
    expect((await s.listBugs({ projectId: fx.projectId }))).toEqual([]) // 列表同口径圈定
  })
})

describe('listBugs：search（summary/error_type/状态中文标签）+ status 过滤 + sort', () => {
  it('AC4 服务端承载三面齐备（标签键命中）', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const s = fx.service
    const { card: b1 } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '登录接口 500', errorType: 'api' })
    const { card: b2 } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '空分页游标越界', errorType: 'paging' })
    const { card: b3 } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '样式错位', errorType: 'css' })
    await s.resolveBug({ projectId: fx.projectId, bugId: b2.bugId, outcome: 'fixed', commitHash: 'b'.repeat(40) })
    await s.resolveBug({ projectId: fx.projectId, bugId: b3.bugId, outcome: 'unresolved', unresolvedReason: '不可复现' })
    // 同毫秒注册的行拉开 created_at（排序断言确定性——同刻 id 决胜不在本测）
    fx.stampBug(b1.bugId, { createdAt: '2026-01-01T00:00:00.000Z' })
    fx.stampBug(b2.bugId, { createdAt: '2026-01-02T00:00:00.000Z' })
    fx.stampBug(b3.bugId, { createdAt: '2026-01-03T00:00:00.000Z' })

    const all = await s.listBugs({ projectId: fx.projectId })
    expect(all.map((b) => b.bugId)).toEqual([b1.bugId, b3.bugId, b2.bugId]) // active：open 优先，终态组 created 降序
    expect((await s.listBugs({ projectId: fx.projectId, sort: 'created' })).map((b) => b.bugId)).toEqual([
      b3.bugId, b2.bugId, b1.bugId,
    ])
    // search：summary 主行 / error_type / 状态中文标签（待修复 = open）
    expect((await s.listBugs({ projectId: fx.projectId, search: '游标' })).map((b) => b.bugId)).toEqual([b2.bugId])
    expect((await s.listBugs({ projectId: fx.projectId, search: 'paging' })).map((b) => b.bugId)).toEqual([b2.bugId])
    expect((await s.listBugs({ projectId: fx.projectId, search: '待修复' })).map((b) => b.bugId)).toEqual([b1.bugId])
    expect((await s.listBugs({ projectId: fx.projectId, search: 'open' })).map((b) => b.bugId)).toEqual([b1.bugId])
    expect(await s.listBugs({ projectId: fx.projectId, search: 'zzz' })).toEqual([])
    // status 过滤 chips
    expect((await s.listBugs({ projectId: fx.projectId, status: ['open'] })).map((b) => b.bugId)).toEqual([b1.bugId])
    expect(
      (await s.listBugs({ projectId: fx.projectId, status: ['fixed', 'unresolved'] })).map((b) => b.bugId).sort(),
    ).toEqual([b2.bugId, b3.bugId].sort())
    expect((await s.listBugs({ projectId: fx.projectId, status: [] })).length).toBe(3)
  })
})

describe('registerBug recurrenceOf：弱引用校验 + 挂链落库 + 悬空拒写 + 链根缺省（RED 锚⑤）', () => {
  it('AC1 带 recurrenceOf 落库（一次写入）；缺席 = 键缺席（链根）', async () => {
    const fx = makeFixture()
    const s = fx.service
    const { card: root } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    expect('recurrenceOf' in root).toBe(false) // 链根缺省
    const { card: relapse } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '又犯了', recurrenceOf: root.bugId })
    expect(relapse.recurrenceOf).toBe(root.bugId)
  })

  it('RED 锚⑤·弱引用格式校验：非法形制拒写（ERR_BUG_RECURRENCE_INVALID）——零 IO 零行零通知', async () => {
    const fx = makeFixture()
    const s = fx.service
    await expect(
      s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, recurrenceOf: 'not-a-bug-id' }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_RECURRENCE_INVALID', data: { recurrenceOf: 'not-a-bug-id' } })
    expect(fx.bugCount()).toBe(0)
    expect(fx.notify).toEqual([])
  })

  it('RED 锚⑤·悬空引用拒写（ERR_BUG_RECURRENCE_DANGLING）——零行零通知', async () => {
    const fx = makeFixture()
    const s = fx.service
    const dangling = '01234567-89ab-cdef-0123-456789abcdef' // 合法形制但不在库
    await expect(
      s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, recurrenceOf: dangling }),
    ).rejects.toMatchObject({ code: 'ERR_BUG_RECURRENCE_DANGLING', data: { recurrenceOf: dangling } })
    expect(fx.bugCount()).toBe(0)
    expect(fx.notify).toEqual([])
  })
})

describe('registerBug 应答：errorType 参考集合（T1 词表收敛——distinct 高频优先限量，零机械归类）', () => {
  it('应答形状 { card, errorTypeSuggestions }；集合来源 = 台账 distinct errorType（高频优先，同频词面升序）', async () => {
    const fx = makeFixture()
    const s = fx.service
    const result = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, errorType: 'api' })
    expect(result.card.bugId).toBeDefined()
    expect(result.errorTypeSuggestions).toEqual(['api']) // 本条已入集合
    await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '乙', errorType: 'paging' })
    await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '丙', errorType: 'paging' })
    await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '丁', errorType: 'css' })
    const last = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '戊', errorType: 'css' })
    // api×1 / paging×2 / css×2 → 高频在前，同频按词面升序
    expect(last.errorTypeSuggestions).toEqual(['css', 'paging', 'api'])
  })

  it('限量：distinct 词数超 ERROR_TYPE_SUGGESTIONS_LIMIT 截断（高频优先保留）', async () => {
    const fx = makeFixture()
    const s = fx.service
    for (let i = 0; i < ERROR_TYPE_SUGGESTIONS_LIMIT + 2; i++) {
      await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: `bug-${i}`, errorType: `type-${String(i).padStart(2, '0')}` })
    }
    // 高频优先：首词 type-00 计 2 次（末轮重复登记一次），其余各 1 次
    const extra = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '首词再登记', errorType: 'type-00' })
    expect(extra.errorTypeSuggestions.length).toBe(ERROR_TYPE_SUGGESTIONS_LIMIT)
    expect(extra.errorTypeSuggestions[0]).toBe('type-00')
    expect(extra.errorTypeSuggestions).not.toContain('type-21') // 低频词面被限量截断
  })

  it('零 errorType 台账 → 空集；空白词不计入集合', async () => {
    const fx = makeFixture()
    const s = fx.service
    const first = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })
    expect(first.errorTypeSuggestions).toEqual([])
    await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '空白词', errorType: '   ' })
    const last = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '仍空集' })
    expect(last.errorTypeSuggestions).toEqual([]) // 空串/纯空白不进词表
  })
})

describe('getBug：全卡 + 链上下文（沿前驱指针回溯全链，时间正序）——行为保持', () => {
  it('AC3 孤条（无前驱无后继）= chain 缺席；全卡字段全量', async () => {
    const fx = makeFixture()
    const s = fx.service
    const { card: bug } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, errorType: 'api' })
    const got = await s.getBug({ projectId: fx.projectId, bugId: bug.bugId })
    expect(got.card).toEqual(bug)
    expect(got.chain).toBeUndefined()
    await expect(s.getBug({ projectId: fx.projectId, bugId: 'nope' })).rejects.toMatchObject({
      code: 'ERR_BUG_NOT_FOUND',
    })
  })

  it('AC3 三节链：entries 时间正序（链根在前）、currentIndex 定位本条、rootBugId = 链根', async () => {
    const fx = makeFixture()
    const s = fx.service
    const { card: root } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '链根' })
    const { card: r1 } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发一', recurrenceOf: root.bugId })
    const { card: r2 } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发二', recurrenceOf: r1.bugId })
    // 同毫秒注册拉开 created_at（时间正序断言确定性）
    fx.stampBug(root.bugId, { createdAt: '2026-01-01T00:00:00.000Z' })
    fx.stampBug(r1.bugId, { createdAt: '2026-01-02T00:00:00.000Z' })
    fx.stampBug(r2.bugId, { createdAt: '2026-01-03T00:00:00.000Z' })

    const fromMiddle = await s.getBug({ projectId: fx.projectId, bugId: r1.bugId })
    expect(fromMiddle.chain?.entries.map((e) => e.bugId)).toEqual([root.bugId, r1.bugId, r2.bugId])
    expect(fromMiddle.chain?.currentIndex).toBe(1)
    expect(fromMiddle.chain?.length).toBe(3)
    expect(fromMiddle.chain?.rootBugId).toBe(root.bugId)
    // 尾节与链根同链快照
    const fromRoot = await s.getBug({ projectId: fx.projectId, bugId: root.bugId })
    expect(fromRoot.chain?.currentIndex).toBe(0)
    expect(fromRoot.chain?.entries.map((e) => e.recurrenceOf)).toEqual([undefined, root.bugId, r1.bugId])
  })
})

describe('listBugs：七字段 search + offset/limit 分页（排序后切片，稳定）', () => {
  it('AC2 关键词命中六文本字段任一（bugDesc/triggerDesc/expected/actual/errorType）', async () => {
    const fx = makeFixture()
    const s = fx.service
    const { card: b1 } = await s.registerBug({
      projectId: fx.projectId,
      summary: '甲',
      bugDesc: '游标越界偶发',
      triggerDesc: '触发词甲',
      expected: '期望词甲',
      actual: '实际词甲',
      errorType: 'paging',
    })
    await s.registerBug({ projectId: fx.projectId, summary: '乙', bugDesc: 'x', triggerDesc: 'y', expected: 'z', actual: 'w' })
    for (const q of ['游标越界', '触发词甲', '期望词甲', '实际词甲', 'paging']) {
      const hit = await s.listBugs({ projectId: fx.projectId, search: q })
      expect(hit.map((b) => b.bugId)).toEqual([b1.bugId])
    }
  })

  it('AC2-recurrence-signal-tiering 关键词命中 suspected 位置（按「哪个文件出过事」检索）', async () => {
    const fx = makeFixture()
    const s = fx.service
    const { card: b1 } = await s.registerBug({
      projectId: fx.projectId,
      summary: '甲',
      bugDesc: 'd',
      triggerDesc: 't',
      expected: 'e',
      actual: 'a',
      suspected: 'src/tools/format.ts:42',
    })
    await s.registerBug({ projectId: fx.projectId, summary: '乙', bugDesc: 'x', triggerDesc: 'y', expected: 'z', actual: 'w' })
    expect((await s.listBugs({ projectId: fx.projectId, search: 'format.ts' })).map((b) => b.bugId)).toEqual([b1.bugId])
  })

  it('AC2 offset/limit 切片（服务端排序后）；越界 = 空集', async () => {
    const fx = makeFixture()
    const s = fx.service
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const { card: b } = await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: `bug-${i}` })
      ids.push(b.bugId)
      fx.stampBug(b.bugId, { createdAt: `2026-01-0${i + 1}T00:00:00.000Z` })
    }
    const newestFirst = [...ids].reverse() // created 降序
    expect((await s.listBugs({ projectId: fx.projectId, sort: 'created', limit: 2 })).map((b) => b.bugId))
      .toEqual(newestFirst.slice(0, 2))
    expect((await s.listBugs({ projectId: fx.projectId, sort: 'created', offset: 2, limit: 2 })).map((b) => b.bugId))
      .toEqual(newestFirst.slice(2, 4))
    expect((await s.listBugs({ projectId: fx.projectId, sort: 'created', offset: 4, limit: 10 })).map((b) => b.bugId))
      .toEqual([newestFirst[4]])
    expect(await s.listBugs({ projectId: fx.projectId, sort: 'created', offset: 9 })).toEqual([])
    expect((await s.listBugs({ projectId: fx.projectId })).length).toBe(5) // 缺省全量
  })
})

describe('commitFiles/fileDiff：fixed 证据变更内容读面（git show 只读；fail-soft 空集/空串）', () => {
  it('commitFiles：name-status 解析（R 双路径取新路径）；hash 形脏/git 失败 = 空集', async () => {
    const fx = makeFixture({
      'show --name-status --format= a1b2c3d': 'M\tpackages/core/src/a.ts\nA\tpackages/web/src/b.tsx\nR100\told.ts\tnew.ts',
    })
    const s = fx.service
    expect(await s.commitFiles({ projectId: fx.projectId, commitHash: 'a1b2c3d' })).toEqual([
      { status: 'M', path: 'packages/core/src/a.ts' },
      { status: 'A', path: 'packages/web/src/b.tsx' },
      { status: 'R100', path: 'new.ts' },
    ])
    expect(fx.calls.some((c) => c.startsWith('show --name-status'))).toBe(true)
    // hash 形脏（注入防御）→ 空集且零 git 调用
    const before = fx.calls.length
    expect(await s.commitFiles({ projectId: fx.projectId, commitHash: 'bad;rm -rf' })).toEqual([])
    expect(fx.calls.length).toBe(before)
    // git 失败 → 空集 fail-soft
    const fail = makeFixture({ 'show --name-status --format= deadbeef': null })
    expect(await fail.service.commitFiles({ projectId: fail.projectId, commitHash: 'deadbeef' })).toEqual([])
  })

  it('fileDiff：单文件 unified diff 原样；path 越界/git 失败 = 空串', async () => {
    const fx = makeFixture({
      'show --format= a1b2c3d -- packages/core/src/a.ts': 'diff --git a/a.ts b/a.ts\n+line',
    })
    const s = fx.service
    expect(await s.fileDiff({ projectId: fx.projectId, commitHash: 'a1b2c3d', path: 'packages/core/src/a.ts' })).toEqual({
      diff: 'diff --git a/a.ts b/a.ts\n+line',
    })
    expect(await s.fileDiff({ projectId: fx.projectId, commitHash: 'a1b2c3d', path: '../escape' })).toEqual({ diff: '' })
    expect(await s.fileDiff({ projectId: fx.projectId, commitHash: 'a1b2c3d', path: '/abs/path' })).toEqual({ diff: '' })
    const fail = makeFixture({})
    expect(await fail.service.fileDiff({ projectId: fail.projectId, commitHash: 'a1b2c3d', path: 'x' })).toEqual({ diff: '' })
  })
})

// T4 覆盖声明闸门——纯 DB 面半：复发家族（recurrence_of 在场）resolveBug(fixed) 必携
// fix_approach 协议两段（coverage: 声明 + anchor: 报告锚），缺席拒写零副作用；锚只做字符串
// 登记（零文件 IO）；非复发家族协议可选零行为变化。锚有效性预检（文件 IO）在 tool 旁挂侧。
describe('T4 覆盖声明闸门：resolveBug fix_approach 协议（纯 DB 面）', () => {
  /** 种复发家族：root open + child（recurrenceOf 挂链）open */
  async function seedFamily(fx: Fx) {
    const root = (await fx.service.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '链根' })).card
    const child = (
      await fx.service.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发节', recurrenceOf: root.bugId })
    ).card
    return { root, child }
  }

  const COMMIT = 'cccccccccccccccccccccccccccccccccccccccc'

  it('AC4-缺席：复发家族 fixed 缺协议两段（fix_approach 缺席）→ ERR_BUG_COVERAGE_DECLARATION_REQUIRED，行留 open 零副作用', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const { child } = await seedFamily(fx)
    await expect(
      fx.service.resolveBug({ projectId: fx.projectId, bugId: child.bugId, outcome: 'fixed', commitHash: COMMIT }),
    ).rejects.toMatchObject({
      code: 'ERR_BUG_COVERAGE_DECLARATION_REQUIRED',
      data: { bugId: child.bugId, missing: ['declaration', 'anchor'] },
    })
    // 拒写零副作用：行留 open、零 fixed 迁移
    const after = await fx.service.getBug({ projectId: fx.projectId, bugId: child.bugId })
    expect(after.card.bugStatus).toBe('open')
  })

  it('AC4-缺席：只有 coverage 行缺 anchor 行 → missing = [anchor]（两段 presence 独立判定）', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const { child } = await seedFamily(fx)
    await expect(
      fx.service.resolveBug({
        projectId: fx.projectId,
        bugId: child.bugId,
        outcome: 'fixed',
        commitHash: COMMIT,
        fixApproach: '修法：原子守卫消除竞态\ncoverage: 消除 check-then-act 共同根因，覆盖整链',
      }),
    ).rejects.toMatchObject({
      code: 'ERR_BUG_COVERAGE_DECLARATION_REQUIRED',
      data: { missing: ['anchor'] },
    })
  })

  it('AC4-双过：coverage + anchor 两段齐备 → fixed 放行，fix_approach 含协议行原样登记（锚只做字符串登记零文件 IO）', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const { child } = await seedFamily(fx)
    const approach =
      '修法：原子守卫消除竞态（状态化写者）\n' +
      'coverage: 消除 check-then-act 共同根因，覆盖整条链\n' +
      'anchor: .forge/docs/proposals/x/issues/1/verification-report.md'
    const card = await fx.service.resolveBug({
      projectId: fx.projectId,
      bugId: child.bugId,
      outcome: 'fixed',
      commitHash: COMMIT,
      fixApproach: approach,
    })
    expect(card.bugStatus).toBe('fixed')
    expect(card.fixApproach).toBe(approach) // 原样登记——不改写不校验锚指向
    expect(card.commitHash).toBe(COMMIT)
  })

  it('回归：非复发家族 fixed 无协议零行为变化（fix_approach 自由一段话照常落库）', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const { root } = await seedFamily(fx)
    const card = await fx.service.resolveBug({
      projectId: fx.projectId,
      bugId: root.bugId, // 无 recurrenceOf——协议可选
      outcome: 'fixed',
      commitHash: COMMIT,
      fixApproach: '普通一段话修法总结',
    })
    expect(card.bugStatus).toBe('fixed')
    expect(card.fixApproach).toBe('普通一段话修法总结')
  })
})

// ─────────────────────────── findRecurrenceCandidates（container_slug 列直比 + 全史 + 全边计数） ───────────────────────────
describe('findRecurrenceCandidates：归属列过滤 + 全史视野 + 最长祖先径全边计数', () => {
  /** 种三员链（root → r1 → r2；project.db 无 tasks 反查径——container_slug 恒留空；
   * created_at 拉开毫秒——候选/链序断言确定性，同毫秒 id 决胜为随机 uuid） */
  async function seedChain(fx: Fx, opts?: { readonly suspected?: string }) {
    const s = fx.service
    const suspected = opts?.suspected !== undefined ? { suspected: opts.suspected } : {}
    const root = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, ...suspected })).card
    const r1 = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发一', ...suspected, recurrenceOf: root.bugId })).card
    const r2 = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发二', ...suspected, recurrenceOf: r1.bugId })).card
    fx.stampBug(root.bugId, { createdAt: '2026-01-01T00:00:00.000Z' })
    fx.stampBug(r1.bugId, { createdAt: '2026-01-02T00:00:00.000Z' })
    fx.stampBug(r2.bugId, { createdAt: '2026-01-03T00:00:00.000Z' })
    return { s, root, r1, r2 }
  }

  /** 种分叉家族（root 一根两子 r1a/r1b——同根多症状） */
  async function seedFork(fx: Fx) {
    const s = fx.service
    const root = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })).card
    const r1a = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '症状甲', recurrenceOf: root.bugId })).card
    const r1b = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '症状乙', recurrenceOf: root.bugId })).card
    fx.stampBug(root.bugId, { createdAt: '2026-01-01T00:00:00.000Z' })
    fx.stampBug(r1a.bugId, { createdAt: '2026-01-02T00:00:00.000Z' })
    fx.stampBug(r1b.bugId, { createdAt: '2026-01-03T00:00:00.000Z' })
    return { s, root, r1a, r1b }
  }

  /** 候选检索便捷（scope 容器锚 = 项目行 project_key 同值——登记径留空列经迁移回填承载） */
  async function find(fx: Fx, slug: string, files: readonly string[] = []) {
    return fx.service.findRecurrenceCandidates(fx.projectId, { slug, localId: 'fix-1', files })
  }

  /** 终态化（复发家族 fixed 携覆盖协议两段） */
  const APPROACH = 'coverage: 覆盖全链共同根因\nanchor: .forge/docs/proposals/f/verification.md'
  async function fixAll(fx: Fx, ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await fx.service.resolveBug({ projectId: fx.projectId, bugId: id, outcome: 'fixed', commitHash: 'ddddddddddddddddddddddddddddddddddddddd', fixApproach: APPROACH })
    }
  }

  it('归属过滤（列直比）：container_slug 列命中容器锚返回全链 + 候选八字段齐备', async () => {
    const fx = makeFixture()
    const { root, r1, r2 } = await seedChain(fx)
    // 登记径列留空（投影降级）；归属命中经迁移回填列承载——直比口径以此列为准
    for (const id of [root.bugId, r1.bugId, r2.bugId]) {
      fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = 'f' WHERE id = ?`).run(id)
    }
    const candidates = await find(fx, 'f')
    expect(candidates.map((c) => c.bugId)).toEqual([root.bugId, r1.bugId, r2.bugId])
    const byId = new Map(candidates.map((c) => [c.bugId, c]))
    expect(byId.get(root.bugId)).toMatchObject({ fullEdgeCount: 0, hasOpen: true, status: 'open', containerSlug: 'f' })
    expect(byId.get(r1.bugId)).toMatchObject({ fullEdgeCount: 1, status: 'open', recurrenceOf: root.bugId })
    expect(byId.get(r2.bugId)).toMatchObject({ fullEdgeCount: 2, status: 'open', recurrenceOf: r1.bugId })
    expect(byId.get(root.bugId)?.lastSeenAt).toBe(root.updatedAt)
    expect('recurrenceOf' in (byId.get(root.bugId) as object)).toBe(false) // 链根键缺席
  })

  it('登记径投影降级：container_slug/source_task_id 缺席留空（两表制无 tasks 反查径——standalone 同语义）', async () => {
    const fx = makeFixture()
    const standalone = (await fx.service.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })).card
    const attributed = (await fx.service.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '带源任务', sourceTaskId: 'uuid-col-1' })).card
    const col = (id: string): { container_slug: string | null; source_task_id: string | null } =>
      fx.domain.db.prepare<unknown[], { container_slug: string | null; source_task_id: string | null }>(
        `SELECT container_slug, source_task_id FROM ${fx.domain.tables.bugs} WHERE id = ?`,
      ).get(id) as { container_slug: string | null; source_task_id: string | null }
    expect(col(standalone.bugId)).toEqual({ container_slug: null, source_task_id: null })
    expect(col(attributed.bugId)).toEqual({ container_slug: null, source_task_id: 'uuid-col-1' }) // 弱引用列原样落库、反查列留空
  })

  it('归属过滤边界：slug 互为 dash 前缀不穿透（loop vs loop-recurrence-hardening，列精确比较）', async () => {
    const backfill = (fx: Fx, ids: readonly string[], slug: string): void => {
      for (const id of ids) fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = ? WHERE id = ?`).run(slug, id)
    }
    // 链落 loop-recurrence-hardening：'loop' 自报不穿透（前缀 ≠ 精确）；全称命中全链
    const fxA = makeFixture()
    const a = await seedChain(fxA)
    backfill(fxA, [a.root.bugId, a.r1.bugId, a.r2.bugId], 'loop-recurrence-hardening')
    const findA = (slug: string) => fxA.service.findRecurrenceCandidates(fxA.projectId, { slug, localId: '1.2', files: [] })
    expect(await findA('loop')).toEqual([])
    expect((await findA('loop-recurrence-hardening')).map((c) => c.bugId)).toEqual([a.root.bugId, a.r1.bugId, a.r2.bugId])
    // 链落 loop：全称自报不穿透（反向同判）
    const fxB = makeFixture()
    const b = await seedChain(fxB)
    backfill(fxB, [b.root.bugId, b.r1.bugId, b.r2.bugId], 'loop')
    expect(await fxB.service.findRecurrenceCandidates(fxB.projectId, { slug: 'loop-recurrence-hardening', localId: '1.2', files: [] })).toEqual([])
  })

  it('归属过滤：无关容器链（列落他容器）不进候选集', async () => {
    const fx = makeFixture()
    const a = await seedChain(fx)
    for (const id of [a.root.bugId, a.r1.bugId, a.r2.bugId]) {
      fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = 'unrelated' WHERE id = ?`).run(id)
    }
    expect(await find(fx, 'f')).toEqual([])
  })

  it('终态过滤移除：全 fixed 链仍产出候选（软动作全史视野），hasOpen=false、全边段照计', async () => {
    const fx = makeFixture()
    const { root, r1, r2 } = await seedChain(fx)
    for (const id of [root.bugId, r1.bugId, r2.bugId]) {
      fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = 'f' WHERE id = ?`).run(id)
    }
    await fixAll(fx, [root.bugId, r1.bugId, r2.bugId])
    const candidates = await find(fx, 'f')
    expect(candidates.map((c) => c.bugId)).toEqual([root.bugId, r1.bugId, r2.bugId])
    expect(candidates.every((c) => c.hasOpen === false)).toBe(true)
    expect(candidates.every((c) => c.status === 'fixed')).toBe(true)
    expect(candidates.find((c) => c.bugId === r2.bugId)?.fullEdgeCount).toBe(2) // fixed 段也计
  })

  it('r3 形态召回：root(f)→r1(f)→r2(f)→r3(open) 盲修链 fullEdgeCount=3、hasOpen=true（旧活态口径计 0 漏拦）', async () => {
    const fx = makeFixture()
    const s = fx.service
    const root = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE })).card
    const r1 = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发一', recurrenceOf: root.bugId })).card
    const r2 = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发二', recurrenceOf: r1.bugId })).card
    const r3 = (await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary: '复发三', recurrenceOf: r2.bugId })).card
    fx.stampBug(root.bugId, { createdAt: '2026-01-01T00:00:00.000Z' })
    fx.stampBug(r1.bugId, { createdAt: '2026-01-02T00:00:00.000Z' })
    fx.stampBug(r2.bugId, { createdAt: '2026-01-03T00:00:00.000Z' })
    fx.stampBug(r3.bugId, { createdAt: '2026-01-04T00:00:00.000Z' })
    for (const id of [root.bugId, r1.bugId, r2.bugId, r3.bugId]) {
      fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = 'f' WHERE id = ?`).run(id)
    }
    await fixAll(fx, [root.bugId, r1.bugId, r2.bugId])
    const candidates = await find(fx, 'f')
    expect(candidates.map((c) => c.bugId)).toEqual([root.bugId, r1.bugId, r2.bugId, r3.bugId])
    const tail = candidates.find((c) => c.bugId === r3.bugId)
    expect(tail?.fullEdgeCount).toBe(3) // 最长祖先径全边（fixed 段也计）
    expect(tail?.hasOpen).toBe(true)
    expect(candidates.every((c) => c.hasOpen === true)).toBe(true) // r3 open → 链级分量
  })

  it('计数语义：分叉家族（一根多子链）fullEdgeCount = 各自祖先径（根 0 / 兄弟各 1），不因 BFS 后继收齐虚高', async () => {
    const fx = makeFixture()
    const { root, r1a, r1b } = await seedFork(fx)
    for (const id of [root.bugId, r1a.bugId, r1b.bugId]) {
      fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = 'f' WHERE id = ?`).run(id)
    }
    const candidates = await find(fx, 'f')
    expect(candidates.map((c) => c.bugId)).toEqual([root.bugId, r1a.bugId, r1b.bugId])
    const byId = new Map(candidates.map((c) => [c.bugId, c]))
    expect(byId.get(root.bugId)?.fullEdgeCount).toBe(0)
    expect(byId.get(r1a.bugId)?.fullEdgeCount).toBe(1)
    expect(byId.get(r1b.bugId)?.fullEdgeCount).toBe(1)
  })

  it('呈现分离：getBug 链呈现口径保持全链（BFS 后继收齐链长 3）≠ 计数 fullEdgeCount', async () => {
    const fx = makeFixture()
    const { root, r1a } = await seedFork(fx)
    for (const id of [root.bugId, r1a.bugId]) {
      fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = 'f' WHERE id = ?`).run(id)
    }
    const view = await fx.service.getBug({ projectId: fx.projectId, bugId: r1a.bugId })
    expect(view.chain?.length).toBe(2)
    const candidates = await find(fx, 'f')
    expect(candidates.find((c) => c.bugId === root.bugId)?.chain.length).toBe(3)
    expect(candidates.find((c) => c.bugId === root.bugId)?.fullEdgeCount).toBe(0)
  })

  it('files 非空（结算径）：归属过滤叠加 suspected 锚路径收窄；零 suspected 候选被滤除', async () => {
    const fx = makeFixture()
    const { root, r1, r2 } = await seedChain(fx, { suspected: 'packages/core/src/forge/tasks/submit.ts:78' })
    for (const id of [root.bugId, r1.bugId, r2.bugId]) {
      fx.domain.db.prepare(`UPDATE ${fx.domain.tables.bugs} SET container_slug = 'f' WHERE id = ?`).run(id)
    }
    fx.stampBug(r2.bugId, { suspected: null }) // r2 零 suspected → 滤除
    const candidates = await fx.service.findRecurrenceCandidates(fx.projectId, {
      slug: 'f', localId: '1',
      files: ['packages/core/src/forge/tasks/submit.ts'],
    })
    expect(candidates.map((c) => c.bugId)).toEqual([root.bugId, r1.bugId])
    expect(candidates.every((c) => c.suspectedLocation !== undefined)).toBe(true)
    const byId = new Map(candidates.map((c) => [c.bugId, c]))
    expect(byId.get(root.bugId)?.fullEdgeCount).toBe(0)
    expect(byId.get(r1.bugId)?.fullEdgeCount).toBe(1)
  })

  it('孤条（无链）不入候选；空台账 = 空集', async () => {
    const fx = makeFixture()
    const s = fx.service
    await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, suspected: 'a.ts:1' })
    expect(await find(fx, 'f')).toEqual([])
  })
})

// ─────────────────────────── aggregateByErrorType（聚合读法——recurrence-signal-tiering） ───────────────────────────
describe('aggregateByErrorType：errorType 分组全史计数', () => {
  it('分组 {errorType,total,open,fixed,lastSeenAt}；unresolved 计入 total；空/空白词不入组', async () => {
    const fx = makeFixture({ 'config user.name': 'faner', 'worktree list --porcelain': PORCELAIN_HIT })
    const s = fx.service
    const reg = (summary: string, errorType?: string) =>
      s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary, ...(errorType !== undefined ? { errorType } : {}) })
    const api1 = (await reg('api-1', 'api')).card
    const paging1 = (await reg('pg-1', 'paging')).card
    const paging2 = (await reg('pg-2', 'paging')).card
    const css1 = (await reg('css-1', 'css')).card
    await reg('blank', '   ')
    await reg('none')
    const apiFixed = await s.resolveBug({ projectId: fx.projectId, bugId: api1.bugId, outcome: 'fixed', commitHash: 'b'.repeat(40) })
    await s.resolveBug({ projectId: fx.projectId, bugId: paging1.bugId, outcome: 'unresolved', unresolvedReason: '不可复现' })
    // lastSeenAt 基准受控：paging 组内两行钉时刻，组值 = 较新者
    fx.stampBug(paging2.bugId, { updatedAt: '2026-01-15T00:00:00.000Z' })
    fx.stampBug(paging1.bugId, { updatedAt: '2026-02-01T00:00:00.000Z' })
    const groups = await s.aggregateByErrorType(fx.projectId)
    expect(groups).toEqual([
      { errorType: 'paging', total: 2, open: 1, fixed: 0, lastSeenAt: '2026-02-01T00:00:00.000Z' }, // unresolved 只计 total
      { errorType: 'api', total: 1, open: 0, fixed: 1, lastSeenAt: apiFixed.updatedAt },
      { errorType: 'css', total: 1, open: 1, fixed: 0, lastSeenAt: css1.updatedAt },
    ])
  })

  it('排序：total 降序、同频词面升序；空台账 = 空集', async () => {
    const fx = makeFixture()
    const s = fx.service
    expect(await s.aggregateByErrorType(fx.projectId)).toEqual([])
    for (const [summary, et] of [['乙', 'zzz'], ['丙', 'zzz'], ['甲', 'aaa']] as const) {
      await s.registerBug({ projectId: fx.projectId, ...REGISTER_BASE, summary, errorType: et })
    }
    const groups = await s.aggregateByErrorType(fx.projectId)
    expect(groups.map((g) => g.errorType)).toEqual(['zzz', 'aaa']) // total 降序
  })
})

// ─────────────────────────── parseTaskContainerSlug（退役兼容层——harness t- 形制纯函数边界） ───────────────────────────
describe('parseTaskContainerSlug：段边界 + 派生词汇白名单', () => {
  it('数字点 localId：t-<slug>-<N[.N]> → slug', () => {
    expect(parseTaskContainerSlug('t-f-1.1')).toBe('f')
    expect(parseTaskContainerSlug('t-loop-recurrence-hardening-1.2')).toBe('loop-recurrence-hardening')
  })
  it('dash-localId 派生词汇（fix-N/disc-N）：剥两段回真实容器（bug 219076e4——伪键消除）', () => {
    expect(parseTaskContainerSlug('t-recurrence-judgment-narrowing-disc-1')).toBe('recurrence-judgment-narrowing')
    expect(parseTaskContainerSlug('t-fx-fix-1')).toBe('fx')
    expect(parseTaskContainerSlug('t-loop-fix-2.1')).toBe('loop')
  })
  it('非该形制 → null：段数不足 / 无数字点末段 / 剥尽为空', () => {
    expect(parseTaskContainerSlug('t-f')).toBeNull()
    expect(parseTaskContainerSlug('t-f-fix')).toBeNull()
    expect(parseTaskContainerSlug('task-uuid-1')).toBeNull() // 非 t- 前缀 = 非管线任务 id
    expect(parseTaskContainerSlug('t-fix-1')).toBe('fix') // 单段 slug 容器（歧义按白名单优先解释——文档声明取舍）
  })
})

// ─────────────────────────── P1-3 失败路径诊断（onDiag 缝——bugs 域整域零诊断站点收口） ───────────────────────────
describe('P1-3 bugs 域失败路径诊断（onDiag 缝）', () => {
  type Diag = { event: string; level: string; message: string }
  const collect = (): { diags: Diag[]; onDiag: (p: Diag) => void } => {
    const diags: Diag[] = []
    return { diags, onDiag: (p) => diags.push(p) }
  }

  it('git 身份双缺席 → reporter 落 (unknown) + bug-git-identity warn 留痕', async () => {
    const d = collect()
    const fx = makeFixture({ 'config user.name': null, 'config user.email': null }, d.onDiag)
    const bug = await registerOpen(fx)
    expect(bug.reporter).toBe('(unknown)')
    const hits = d.diags.filter((x) => x.event === 'bug-git-identity')
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.every((x) => x.level === 'warn')).toBe(true)
  })

  it('fixed 证据反查双径全败（porcelain + branch --contains）→ bug-git-evidence warn，fixed 行照落', async () => {
    const d = collect()
    const fx = makeFixture(
      {
        'config user.name': 'faner',
        'worktree list --porcelain': null,
        'branch --contains aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': null,
      },
      d.onDiag,
    )
    const bug = await registerOpen(fx)
    const card = await fx.service.resolveBug({
      projectId: fx.projectId,
      bugId: bug.bugId,
      outcome: 'fixed',
      commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
    expect(card.worktree).toBeUndefined()
    expect(card.branch).toBeUndefined()
    expect(d.diags.filter((x) => x.event === 'bug-git-evidence').length).toBeGreaterThanOrEqual(1)
  })

  it('commitFiles/fileDiff git show 失败 → 空集 fail-soft + bug-git-evidence warn（各一条）', async () => {
    const d = collect()
    const hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const fx = makeFixture(
      {
        'config user.name': 'faner',
        [`show --name-status --format= ${hash}`]: null,
        [`show --format= ${hash} -- Z:/repo/a.ts`]: null,
      },
      d.onDiag,
    )
    expect(await fx.service.commitFiles({ projectId: fx.projectId, commitHash: hash })).toEqual([])
    expect((await fx.service.fileDiff({ projectId: fx.projectId, commitHash: hash, path: 'Z:/repo/a.ts' })).diff).toBe('')
    expect(d.diags.filter((x) => x.event === 'bug-git-evidence')).toHaveLength(2)
  })

  it('onDiag 缺席 → 零 emit 零抛（行为不变——诊断缝纯增量）', async () => {
    const fx = makeFixture({ 'config user.name': null, 'config user.email': null })
    const bug = await registerOpen(fx)
    expect(bug.reporter).toBe('(unknown)')
  })
})
