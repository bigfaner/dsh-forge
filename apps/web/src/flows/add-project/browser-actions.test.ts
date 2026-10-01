// browser-actions 单测 —— 交互转移语义（静态标记测不了的面）：导航落位/选中清零/canonical
// 对账（AC1）、失败拦截与重试口径（AC4）、竞态守卫、选中唯一（AC3）、上一级判据。
import { describe, expect, it } from 'vitest'
import type { DirListing } from '@dsh-forge/contracts'
import { browserActions, type BrowserActionsDeps } from './browser-actions.js'
import { initialBrowserState, selectEntry, type BrowserState } from './browser-model.js'
import type { DirSource, ListingPhase } from './dir-source.js'

/** 可编程延迟数据源（逐请求挂起 → 手动 resolve/reject） */
function deferredSource() {
  const pending: Array<{
    resolve: (listing: DirListing) => void
    reject: (cause: unknown) => void
  }> = []
  const calls: Array<string | undefined> = []
  const source: DirSource = (dirPath) => {
    calls.push(dirPath)
    return new Promise<DirListing>((resolve, reject) => {
      pending.push({ resolve, reject })
    })
  }
  return {
    source,
    calls,
    resolveNext: (listing: DirListing) => void pending.shift()?.resolve(listing),
    rejectNext: (cause: unknown) => void pending.shift()?.reject(cause),
  }
}

/** 内存态替身（React setState 同形） */
function fakeStore(initial: BrowserState) {
  let nav = initial
  let phase: ListingPhase = { phase: 'loading' }
  const deps: BrowserActionsDeps = {
    source: deferredSource().source, // 占位（各用例覆盖）
    setNav: (updater) => {
      nav = updater(nav)
    },
    setPhase: (next) => {
      phase = next
    },
    getNav: () => nav,
    getPhase: () => phase,
  }
  return {
    deps,
    nav: () => nav,
    phase: () => phase,
  }
}

/** 微任务冲刷（resolve/reject 的 then 链落位后再断言） */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const HOME: DirListing = { path: 'C:\\Users\\panda', parentPath: 'C:\\Users', entries: [] }
const PROJECT: DirListing = {
  path: 'Z:\\project',
  parentPath: 'Z:\\',
  entries: [{ name: 'dsh', path: 'Z:\\project\\dsh' }],
}

describe('load：导航与列举（AC1）', () => {
  it('发起：相位 loading + 导航即时落位（选中清零）', () => {
    const store = fakeStore(selectEntry(initialBrowserState('Z:\\'), 'Z:\\old'))
    const d = deferredSource()
    const actions = browserActions({ ...store.deps, source: d.source })
    actions.load('Z:\\project')
    expect(store.phase()).toEqual({ phase: 'loading' })
    expect(store.nav()).toEqual({ cwd: 'Z:\\project', selected: null })
    expect(d.calls).toEqual(['Z:\\project'])
  })

  it('成功：相位 ready + cwd 对账 host canonical path（不信输入原样）', async () => {
    const store = fakeStore(initialBrowserState())
    const d = deferredSource()
    browserActions({ ...store.deps, source: d.source }).load('z:\\PROJECT')
    d.resolveNext(PROJECT)
    await flush()
    expect(store.phase()).toEqual({ phase: 'ready', listing: PROJECT })
    expect(store.nav()).toEqual({ cwd: 'Z:\\project', selected: null })
  })

  it('缺省目标 = 主目录请求（undefined 透传）', async () => {
    const store = fakeStore(initialBrowserState('Z:\\somewhere'))
    const d = deferredSource()
    browserActions({ ...store.deps, source: d.source }).load()
    expect(d.calls).toEqual([undefined])
    d.resolveNext(HOME)
    await flush()
    expect(store.nav().cwd).toBe('C:\\Users\\panda')
  })
})

describe('失败拦截与重试（AC4：错误条不出浏览器态）', () => {
  it('失败：相位 error（消息归一）+ 导航态保持失败目标（重试口径）', async () => {
    const store = fakeStore(initialBrowserState())
    const d = deferredSource()
    const actions = browserActions({ ...store.deps, source: d.source })
    actions.load('Z:\\gone')
    d.rejectNext(new Error('目录不可达：Z:\\gone（ENOENT）'))
    await flush()
    expect(store.phase()).toEqual({ phase: 'error', message: '目录不可达：Z:\\gone（ENOENT）' })
    expect(store.nav()).toEqual({ cwd: 'Z:\\gone', selected: null })
  })

  it('重试 = 重发失败目标（nav.cwd）；首拉主目录失败重试 = 缺省请求', async () => {
    const store = fakeStore(initialBrowserState())
    const d = deferredSource()
    const actions = browserActions({ ...store.deps, source: d.source })
    actions.load('Z:\\gone')
    d.rejectNext(new Error('x'))
    await flush()
    actions.retry()
    expect(d.calls).toEqual(['Z:\\gone', 'Z:\\gone'])
    // 首拉缺省失败：nav.cwd = null → 重试仍发缺省（主目录）
    const store2 = fakeStore(initialBrowserState())
    const d2 = deferredSource()
    const actions2 = browserActions({ ...store2.deps, source: d2.source })
    actions2.load()
    d2.rejectNext(new Error('y'))
    await flush()
    actions2.retry()
    expect(d2.calls).toEqual([undefined, undefined])
  })
})

describe('竞态守卫（快速导航丢弃迟到响应）', () => {
  it('先发 A 后发 B：A 的迟到结果不落位（相位/导航以 B 为准）', async () => {
    const store = fakeStore(initialBrowserState())
    const d = deferredSource()
    const actions = browserActions({ ...store.deps, source: d.source })
    actions.load('Z:\\a')
    actions.load('Z:\\b')
    d.resolveNext({ path: 'Z:\\a', parentPath: 'Z:\\', entries: [] }) // A 迟到 → 丢弃
    await flush()
    expect(store.phase()).toEqual({ phase: 'loading' }) // 未被 A 覆盖
    d.resolveNext(PROJECT) // B 落位
    await flush()
    expect(store.nav().cwd).toBe('Z:\\project')
    expect(store.phase()).toEqual({ phase: 'ready', listing: PROJECT })
  })
})

describe('select / up（AC3 选中唯一；上一级判据）', () => {
  it('select：后选替换先选（唯一）', () => {
    const store = fakeStore(initialBrowserState('Z:\\project'))
    const actions = browserActions({ ...store.deps, source: deferredSource().source })
    actions.select('Z:\\project\\dsh')
    actions.select('Z:\\project\\ai')
    expect(store.nav().selected).toBe('Z:\\project\\ai')
  })

  it('up：就绪且有父目录 → load(parent)；根（parentPath null）/ 错误相位 → no-op', async () => {
    const store = fakeStore(initialBrowserState('Z:\\project'))
    const d = deferredSource()
    const actions = browserActions({ ...store.deps, source: d.source })
    // 根：parentPath null → no-op
    actions.load('Z:\\')
    d.resolveNext({ path: 'Z:\\', parentPath: null, entries: [] })
    await flush()
    actions.up()
    expect(d.calls).toEqual(['Z:\\']) // 未新增请求
    // 就绪且有父目录 → load(parent)
    actions.load('Z:\\project')
    d.resolveNext(PROJECT)
    await flush()
    actions.up()
    expect(d.calls).toEqual(['Z:\\', 'Z:\\project', 'Z:\\'])
    // 错误相位 → no-op
    actions.load('Z:\\gone')
    d.rejectNext(new Error('x'))
    await flush()
    actions.up()
    expect(d.calls).toEqual(['Z:\\', 'Z:\\project', 'Z:\\', 'Z:\\gone'])
  })
})
