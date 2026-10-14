// bug-source 纯模型测试（定位：单测——@ Bug 引用 source 契约面 + ReferenceCodec +
// 快照缓存回退 + 状态口径过滤；零 DOM / 零真实 RPC——取数经注入 listBugs 递达）。
import { describe, expect, it, vi } from 'vitest'
import {
  bugCandidates,
  bugReferenceInsertOf,
  clipboardTextOf,
  createBugReferenceSource,
  filterBugsByScope,
  relativeTime,
  serializeBugCard,
  type BugCardSource,
} from './bug-source.js'

function card(extra: Partial<BugCardSource> = {}): BugCardSource {
  return {
    bugId: 'b-42',
    summary: '修复后段一目录选取双开对话框',
    bugDesc: 'NativePick 在途态守卫缺失，双击「浏览…」连开两个系统对话框。',
    triggerDesc: '段一表单点「浏览…」，对话框在途时再次快速单击同钮。',
    expected: '在途态内后续单击被吞，恒至多一个对话框。',
    actual: '连开两个对话框，后开者选中结果覆盖先开者。',
    bugStatus: 'open',
    reporter: 'faner',
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T08:00:00.000Z',
    ...extra,
  }
}

const NOW = Date.parse('2026-10-14T12:00:00.000Z')
const SIGNAL = new AbortController().signal
const SESSION = { sessionId: 'sess-1' }

/** 索引取行（断言在位后非空取出——noUncheckedIndexedAccess 友好） */
function at<T>(rows: readonly T[], i: number): T {
  const row = rows[i]
  if (row === undefined) throw new Error(`row ${i} missing`)
  return row
}

function request(overrides: { query?: string; quoted?: boolean } = {}) {
  return {
    query: overrides.query ?? '',
    ...(overrides.quoted !== undefined ? { quoted: overrides.quoted } : {}),
    position: 'inline' as const,
    drilled: false,
    signal: SIGNAL,
  }
}

describe('clipboardText（@[摘要](bug:<bugId>) 投影）', () => {
  it('输出 @[摘要](bug:<bugId>) 形式', () => {
    expect(clipboardTextOf('修复双开对话框', 'b-42')).toBe('@[修复双开对话框](bug:b-42)')
  })
})

describe('serializeBugCard（<bug bugId> 结构化字段块——与提案示例逐字段一致）', () => {
  it('全字段卡：summary/bugStatus/errorType/bugDesc/triggerDesc/expected/actual/suspected 逐行', () => {
    const bug = card({ errorType: 'concurrency', suspected: 'apps/web/src/flows/add-project/browser-actions.ts:120' })
    expect(serializeBugCard(bug)).toBe(
      [
        '<bug bugId="b-42">',
        '  summary: 修复后段一目录选取双开对话框',
        '  bugStatus: open',
        '  errorType: concurrency',
        '  bugDesc: NativePick 在途态守卫缺失，双击「浏览…」连开两个系统对话框。',
        '  triggerDesc: 段一表单点「浏览…」，对话框在途时再次快速单击同钮。',
        '  expected: 在途态内后续单击被吞，恒至多一个对话框。',
        '  actual: 连开两个对话框，后开者选中结果覆盖先开者。',
        '  suspected: apps/web/src/flows/add-project/browser-actions.ts:120',
        '</bug>',
      ].join('\n'),
    )
  })

  it('可空字段缺席：errorType/suspected 整行不出键，恒在六字段俱在', () => {
    const block = serializeBugCard(card())
    expect(block).toContain('  summary: ')
    expect(block).toContain('  bugStatus: open')
    expect(block).toContain('  bugDesc: ')
    expect(block).toContain('  triggerDesc: ')
    expect(block).toContain('  expected: ')
    expect(block).toContain('  actual: ')
    expect(block).not.toContain('errorType')
    expect(block).not.toContain('suspected')
  })
})

describe('filterBugsByScope（状态口径纯过滤）', () => {
  const bugs = [card({ bugId: 'a', bugStatus: 'open' }), card({ bugId: 'b', bugStatus: 'fixed' }), card({ bugId: 'c', bugStatus: 'unresolved' })]

  it("all = 三态全列；'fixed' = 仅该状态子集", () => {
    expect(filterBugsByScope(bugs, 'all').map((b) => b.bugId)).toEqual(['a', 'b', 'c'])
    expect(filterBugsByScope(bugs, 'fixed').map((b) => b.bugId)).toEqual(['b'])
    expect(filterBugsByScope(bugs, 'unresolved').map((b) => b.bugId)).toEqual(['c'])
  })
})

describe('bugCandidates（候选行投影 + open 优先排序）', () => {
  it('投影四件套：name=bugId / label=summary / description=状态·错误类型 / hint=登记相对时间', () => {
    const bug = card({ errorType: 'concurrency', createdAt: '2026-10-14T11:00:00.000Z' })
    const rows = bugCandidates([bug], { statusScope: 'all', nowMs: NOW })
    expect(rows).toHaveLength(1)
    expect(at(rows, 0).name).toBe('b-42')
    expect(at(rows, 0).label).toBe('修复后段一目录选取双开对话框')
    expect(at(rows, 0).description).toBe('open · concurrency')
    expect(at(rows, 0).hint).toBe('1 小时前')
  })

  it('errorType 缺席：description 只含状态；open 优先排序（stable——组内保持原序）', () => {
    const rows = bugCandidates(
      [card({ bugId: 'x', bugStatus: 'fixed' }), card({ bugId: 'y', bugStatus: 'open' }), card({ bugId: 'z', bugStatus: 'fixed' })],
      { statusScope: 'all', nowMs: NOW },
    )
    expect(rows.map((r) => r.name)).toEqual(['y', 'x', 'z'])
    expect(at(rows, 0).description).toBe('open')
  })

  it('statusScope 参与过滤：fixed 口径只剩 fixed 子集', () => {
    const rows = bugCandidates(
      [card({ bugId: 'x', bugStatus: 'fixed' }), card({ bugId: 'y', bugStatus: 'open' })],
      { statusScope: 'fixed', nowMs: NOW },
    )
    expect(rows.map((r) => r.name)).toEqual(['x'])
  })
})

describe('relativeTime（登记相对时间）', () => {
  it('分级：刚刚 / 分钟 / 小时 / 天 / 月 / 年', () => {
    expect(relativeTime('2026-10-14T11:59:30.000Z', NOW)).toBe('刚刚')
    expect(relativeTime('2026-10-14T11:40:00.000Z', NOW)).toBe('20 分钟前')
    expect(relativeTime('2026-10-14T09:00:00.000Z', NOW)).toBe('3 小时前')
    expect(relativeTime('2026-10-12T12:00:00.000Z', NOW)).toBe('2 天前')
    expect(relativeTime('2026-08-20T12:00:00.000Z', NOW)).toBe('1 个月前')
    expect(relativeTime('2024-10-14T12:00:00.000Z', NOW)).toBe('2 年前')
  })
  it('非法时刻：回退原字符串', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('not-a-date')
  })
})

describe('createBugReferenceSource（source 契约面——注入取数，零直连 RPC）', () => {
  function deps(overrides: { listBugs?: ReturnType<typeof vi.fn>; projectId?: () => string | undefined } = {}) {
    const listBugs =
      overrides.listBugs ??
      vi.fn(() => Promise.resolve([card(), card({ bugId: 'b-7', summary: '旧 bug', bugStatus: 'fixed', createdAt: '2026-09-01T00:00:00.000Z' })]))
    return {
      listBugs,
      source: createBugReferenceSource({
        projectId: overrides.projectId ?? (() => 'proj-1'),
        listBugs: listBugs as unknown as (q: unknown) => Promise<readonly BugCardSource[]>,
        now: () => NOW,
      }),
    }
  }

  it('candidates：query 透传 search；all 口径不带 status；open 优先排序', async () => {
    const { listBugs, source } = deps()
    const rows = await source.candidates(SESSION, request({ query: '双开' }))
    expect(listBugs).toHaveBeenCalledWith({ projectId: 'proj-1', search: '双开' })
    expect(rows.map((r) => r.name)).toEqual(['b-42', 'b-7'])
  })

  it('candidates：状态口径映射 bugs.list status 入参', async () => {
    const { listBugs, source } = deps()
    source.setBugStatusScope('fixed')
    await source.candidates(SESSION, request())
    expect(listBugs).toHaveBeenCalledWith({ projectId: 'proj-1', status: ['fixed'] })
  })

  it('quoted=true：空候选且不打 RPC（@" 引号路径态规避）', async () => {
    const { listBugs, source } = deps()
    const rows = await source.candidates(SESSION, request({ quoted: true }))
    expect(rows).toEqual([])
    expect(listBugs).not.toHaveBeenCalled()
  })

  it('projectId 未解析：空候选 fail-soft', async () => {
    const { listBugs } = deps({ projectId: () => undefined })
    const source = createBugReferenceSource({ projectId: () => undefined, listBugs: listBugs as unknown as (q: unknown) => Promise<readonly BugCardSource[]>, now: () => NOW })
    await expect(source.candidates(SESSION, request())).resolves.toEqual([])
    expect(listBugs).not.toHaveBeenCalled()
  })

  it('listBugs 失败：空候选不抛（fail-soft，他组不受累）', async () => {
    const { source } = deps({ listBugs: vi.fn(() => Promise.reject(new Error('rpc down'))) })
    await expect(source.candidates(SESSION, request())).resolves.toEqual([])
  })

  it('onPick：ReferenceInsert（source/ref=bug:<id>/label/clipboardText）且快照落缓存', async () => {
    const { source } = deps()
    const rows = await source.candidates(SESSION, request())
    const outcome = source.onPick({ candidate: at(rows, 0), session: SESSION, position: 'inline', via: 'menu', action: 'pick' })
    expect(outcome).toMatchObject({
      insert: {
        source: 'bug',
        ref: 'bug:b-42',
        label: '修复后段一目录选取双开对话框',
        clipboardText: '@[修复后段一目录选取双开对话框](bug:b-42)',
      },
    })
  })

  /** 可编程取数：成功返回一次卡后转为拒绝（模拟 bug resolve 后查询落空） */
  function listBugsThenFail(): ReturnType<typeof vi.fn> {
    const calls: number[] = []
    return vi.fn(() => {
      calls.push(1)
      if (calls.length === 1) return Promise.resolve([card()])
      return Promise.reject(new Error('rpc down'))
    })
  }

  it('快照优先：pick 缓存的卡先于现查——listBugs 后来拒绝也 serialize 出全字段块', async () => {
    const { source } = deps({ listBugs: listBugsThenFail() })
    const rows = await source.candidates(SESSION, request())
    source.onPick({ candidate: at(rows, 0), session: SESSION, position: 'inline', via: 'menu', action: 'pick' })
    const block = await source.codec.serialize('bug:b-42', SIGNAL)
    expect(block).toContain('<bug bugId="b-42">')
    expect(block).toContain('  summary: 修复后段一目录选取双开对话框')
    expect(block).toContain('  actual: ')
  })

  it('cacheBugSnapshot（bug 27ab222b）：外部插入径（按钮快速路径）直落全卡快照——serialize 命中全字段块，listBugs 拒绝也不落占位', async () => {
    const { source } = deps({ listBugs: vi.fn(() => Promise.reject(new Error('rpc down'))) })
    source.cacheBugSnapshot(card())
    const block = await source.codec.serialize('bug:b-42', SIGNAL)
    expect(block).toContain('<bug bugId="b-42">')
    expect(block).toContain('  summary: 修复后段一目录选取双开对话框')
    expect(block).toContain('  bugDesc: ')
    expect(block).not.toContain('bug 详情不可用')
  })

  it('cacheBugSnapshot 最小入参（仅 bugId+summary，bugDesc 缺席）不冒充全卡——serialize 照走现查/回退链', async () => {
    const { source } = deps({ listBugs: vi.fn(() => Promise.resolve([card()])) })
    source.cacheBugSnapshot({ bugId: 'b-42', summary: '修复后段一目录选取双开对话框' })
    const block = await source.codec.serialize('bug:b-42', SIGNAL)
    expect(block).toContain('  bugDesc: ')
  })

  it('seedSnapshots（bug 476b2d3d）：warm 预取全量台账种快照——还原 chip（无任何插入事件）serialize 恒命中全卡', async () => {
    const { source } = deps({ listBugs: vi.fn(() => Promise.reject(new Error('rpc down'))) })
    source.seedSnapshots([card(), card({ bugId: 'b-7', summary: '旧 bug', bugStatus: 'fixed' })])
    const block = await source.codec.serialize('bug:b-7', SIGNAL)
    expect(block).toContain('<bug bugId="b-7">')
    expect(block).toContain('  bugDesc: ')
    expect(block).not.toContain('bug 详情不可用')
  })

  it('seedSnapshots 不覆盖既有快照（pick 的卡优先——种子只补缺席）', async () => {
    const { source } = deps({ listBugs: vi.fn(() => Promise.reject(new Error('rpc down'))) })
    source.cacheBugSnapshot(card())
    source.seedSnapshots([card({ bugId: 'b-42', summary: '种子旧标题' })])
    const block = await source.codec.serialize('bug:b-42', SIGNAL)
    expect(block).toContain('  summary: 修复后段一目录选取双开对话框')
  })

  it('现查回退：无快照时 serialize 走 listBugs 命中', async () => {
    const { listBugs, source } = deps()
    const block = await source.codec.serialize('bug:b-7', SIGNAL)
    expect(block).toContain('<bug bugId="b-7">')
    expect(block).toContain('  summary: 旧 bug')
    expect(listBugs).toHaveBeenCalled()
  })

  it('末级回退：两路都失败 serialize 出 id+摘要最小块且永不抛错（不阻断发送）', async () => {
    const { source } = deps({ listBugs: vi.fn(() => Promise.reject(new Error('rpc down'))) })
    await expect(source.codec.serialize('bug:ghost', SIGNAL)).resolves.toBe('<bug bugId="ghost">\n  summary: （bug 详情不可用）\n</bug>')
  })

  it('clipboardText：快照摘要优先，无快照回退 bugId 充摘要，均不抛', async () => {
    const { source } = deps({ listBugs: listBugsThenFail() })
    const rows = await source.candidates(SESSION, request())
    source.onPick({ candidate: at(rows, 0), session: SESSION, position: 'inline', via: 'menu', action: 'pick' })
    expect(source.codec.clipboardText('bug:b-42')).toBe('@[修复后段一目录选取双开对话框](bug:b-42)')
    expect(source.codec.clipboardText('bug:ghost')).toBe('@[ghost](bug:ghost)')
  })

  it('取数竞态守卫（bug 27ab222b）：旧查询慢返回作废——不出候选、不污染快照底，pick 仍落全卡', async () => {
    function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
      let resolve!: (v: T) => void
      const promise = new Promise<T>((r) => { resolve = r })
      return { promise, resolve }
    }
    const older = deferred<readonly BugCardSource[]>()
    const newer = deferred<readonly BugCardSource[]>()
    let call = 0
    const listBugs = vi.fn((): Promise<readonly BugCardSource[]> => (++call === 1 ? older.promise : newer.promise))
    const source = createBugReferenceSource({ projectId: () => 'p-1', listBugs: listBugs as unknown as (q: unknown) => Promise<readonly BugCardSource[]>, now: () => NOW })
    const p1 = source.candidates(SESSION, request({ query: '双开' }))
    const p2 = source.candidates(SESSION, request({ query: '' }))
    newer.resolve([card()])
    older.resolve([card({ bugId: 'b-stale', summary: '旧慢结果' })])
    const [rows1, rows2] = await Promise.all([p1, p2])
    expect(rows1).toEqual([]) // 旧代作废——不渲染不落快照底
    expect(rows2.map((r) => r.name)).toEqual(['b-42'])
    source.onPick({ candidate: at(rows2, 0), session: SESSION, position: 'inline', via: 'menu', action: 'pick' })
    const block = await source.codec.serialize('bug:b-42', SIGNAL)
    expect(block).toContain('  bugDesc: ')
    expect(block).not.toContain('bug 详情不可用')
  })

  it('状态面包屑 crumb pick（action=drill）：切换状态口径并 handled', async () => {
    const { listBugs, source } = deps()
    const outcome = source.onPick({ candidate: { name: 'scope:open', value: 'scope:open' }, session: SESSION, position: 'inline', via: 'menu', action: 'drill' })
    expect(outcome).toBe('handled')
    await source.candidates(SESSION, request())
    expect(listBugs).toHaveBeenLastCalledWith({ projectId: 'proj-1', status: ['open'] })
  })

  it('header：状态面包屑四 crumb，当前口径标 current', () => {
    const { source } = deps()
    const crumbs = source.header?.(SESSION, { query: '', drilled: false })
    expect(crumbs?.map((c) => c.value)).toEqual(['scope:all', 'scope:open', 'scope:fixed', 'scope:unresolved'])
    expect(crumbs?.find((c) => c.current)?.value).toBe('scope:all')
  })
})

describe('bugReferenceInsertOf（chip 构造单一事实源——composer-bug-reference 1.4 快速路径）', () => {
  it('产出 = @ pick insert 同构（同 source/ref/label/clipboardText 路由）', () => {
    expect(bugReferenceInsertOf({ bugId: 'b-42', summary: '修复后段一目录选取双开对话框' }, 'dswf-bug')).toEqual({
      source: 'dswf-bug',
      ref: 'bug:b-42',
      label: '修复后段一目录选取双开对话框',
      clipboardText: '@[修复后段一目录选取双开对话框](bug:b-42)',
    })
    expect(bugReferenceInsertOf({ bugId: 'b-1', summary: 's' })).toMatchObject({ source: 'bug' })
  })

  it('@ 菜单 pick 产物经同一路径（onPick insert ≡ bugReferenceInsertOf 输出）', async () => {
    const source = createBugReferenceSource({ projectId: () => 'proj-1', listBugs: () => Promise.resolve([card()]) })
    const rows = await source.candidates(SESSION, request())
    const outcome = source.onPick({ candidate: at(rows, 0), session: SESSION, position: 'inline', via: 'menu', action: 'pick' })
    expect(outcome).toEqual({
      insert: bugReferenceInsertOf({ bugId: 'b-42', summary: '修复后段一目录选取双开对话框' }, source.name),
    })
  })
})
