// form-actions 单测 —— UF-3 段二交互转移面（AC4 联动两分支的动作级自证 + 浏览相位/取消
// 零副作用 + fix-14 原生浏览改选：三 target 同桥直选/取消零副作用/双击守卫/错误面）。
// setState 同形内存替身直落转移语义（browser-actions.test 同形制）。
import { describe, expect, it } from 'vitest'
import type { BrowserSelection } from './browser-model.js'
import { formActions, nativeBrowseAction, type FormActions } from './form-actions.js'
import { initialFormState, type BrowseTarget, type FormState } from './form-model.js'

const SELECTION: BrowserSelection = { path: 'Z:\\project\\dsh', registered: false }
const NEW_WS = 'D:\\work\\alpha'

function harness(initial: FormState = initialFormState(SELECTION)): {
  readonly form: FormState
  readonly browsing: BrowseTarget | null
  readonly actions: FormActions
} {
  const state = { form: initial, browsing: null as BrowseTarget | null }
  const actions = formActions({
    setForm: (updater) => {
      state.form = updater(state.form)
    },
    setBrowsing: (target) => {
      state.browsing = target
    },
  })
  return {
    get form() {
      return state.form
    },
    get browsing() {
      return state.browsing
    },
    actions,
  }
}

describe('直输改（edit：值更新 + touched 置位——AC4 手改判据）', () => {
  it('改项目名 → 值更新且 name touched；其余字段不动', () => {
    const h = harness()
    h.actions.edit('name', '我的项目')
    expect(h.form.values.name).toBe('我的项目')
    expect(h.form.touched).toEqual({ name: true, forgeDir: false, knowledgeDir: false })
  })

  it('直输改 forge 目录 → touched 置位（后续换选工作区保留的判据）', () => {
    const h = harness()
    h.actions.edit('forgeDir', 'E:\\docs\\dsh')
    expect(h.form.values.forgeDir).toBe('E:\\docs\\dsh')
    expect(h.form.touched.forgeDir).toBe(true)
  })
})

describe('浏览相位（repick / browse / cancelBrowse）', () => {
  it('「重新选择」→ 浏览相位 = workspace；「浏览…」→ 相位 = 目标字段', () => {
    const h = harness()
    h.actions.repick()
    expect(h.browsing).toBe('workspace')
    h.actions.browse('knowledgeDir')
    expect(h.browsing).toBe('knowledgeDir')
    h.actions.browse('forgeDir')
    expect(h.browsing).toBe('forgeDir')
  })

  it('浏览返回 = 零值变更（取消点在 dsh create 之前，表单态原样）', () => {
    const h = harness()
    h.actions.browse('forgeDir')
    const before = h.form
    h.actions.cancelBrowse()
    expect(h.browsing).toBeNull()
    expect(h.form).toBe(before) // 同一引用——未触发任何表单更新
  })
})

describe('浏览确认落值（applyPick：AC4 两分支的动作级走查）', () => {
  it('工作区改选：未手改字段随新工作区重构（name/forge/kn = 新默认值）', () => {
    const h = harness()
    h.actions.applyPick('workspace', NEW_WS)
    expect(h.browsing).toBeNull()
    expect(h.form.values).toEqual({
      workspaceDir: NEW_WS,
      name: 'alpha',
      forgeDir: 'D:\\work\\alpha\\.forge',
      knowledgeDir: 'D:\\work\\alpha\\.knowledge',
    })
  })

  it('工作区改选：手改过的项目名保留；未手改的两目录重构', () => {
    const h = harness()
    h.actions.edit('name', '我的项目')
    h.actions.applyPick('workspace', NEW_WS)
    expect(h.form.values.name).toBe('我的项目')
    expect(h.form.values.forgeDir).toBe('D:\\work\\alpha\\.forge')
  })

  it('目录浏览选定：回填该字段 + touched 置位（换选工作区时保留）', () => {
    const h = harness()
    h.actions.applyPick('forgeDir', 'E:\\docs\\dsh')
    expect(h.browsing).toBeNull()
    expect(h.form.values.forgeDir).toBe('E:\\docs\\dsh')
    expect(h.form.touched.forgeDir).toBe(true)
    // 后续换选工作区：浏览选定过的 forge 目录保留，未动的知识库目录重构
    h.actions.applyPick('workspace', NEW_WS)
    expect(h.form.values.forgeDir).toBe('E:\\docs\\dsh')
    expect(h.form.values.knowledgeDir).toBe('D:\\work\\alpha\\.knowledge')
  })
})

describe('外部换选（relinkExternal：2.10 返回上一步重选工作区）', () => {
  it('路径变更 → 联动 relink（未手改字段重构）', () => {
    const h = harness()
    h.actions.relinkExternal(NEW_WS)
    expect(h.form.values.workspaceDir).toBe(NEW_WS)
    expect(h.form.values.name).toBe('alpha')
  })

  it('同路径 → no-op（状态引用不变，mount/重复渲染不扰动手改值）', () => {
    const h = harness()
    h.actions.edit('name', '我的项目')
    const before = h.form
    h.actions.relinkExternal(SELECTION.path)
    expect(h.form).toBe(before)
    expect(h.form.values.name).toBe('我的项目')
  })
})

describe('原生浏览改选（fix-14 nativeBrowseAction：三 target 同桥直选）', () => {
  /** 手动放行的选取桩 + 记录面（busy/error/apply 事件序列） */
  function nativeHarness(canonical: string): {
    readonly action: (target: BrowseTarget) => void
    readonly events: readonly string[]
    readonly dirCalls: readonly string[]
    readonly settle: (outcome: string | null | Error) => void
  } {
    const events: string[] = []
    const dirCalls: string[] = []
    let release: ((outcome: string | null | Error) => void) | null = null
    const action = nativeBrowseAction({
      pick: () =>
        new Promise<string | null>((resolve, reject) => {
          release = (outcome) => {
            if (outcome instanceof Error) reject(outcome)
            else resolve(outcome)
          }
        }),
      dirSource: async (dirPath) => {
        dirCalls.push(dirPath ?? '')
        return { path: canonical, parentPath: null, entries: [] }
      },
      applyPick: (target) => {
        events.push(`apply:${target}`)
      },
      onBusy: (busy) => {
        events.push(busy ? 'busy:true' : 'busy:false')
      },
      onError: (message) => {
        events.push(`error:${message ?? 'null'}`)
      },
    })
    return { action, events, dirCalls, settle: (outcome) => { release?.(outcome) } }
  }

  it('选中 → canonical 对账后 applyPick 目标字段（BrowsePanel 确认同径唯一落值口）', async () => {
    const n = nativeHarness('D:\\work\\ALPHA') // host canonical 化（大小写对账）
    n.action('forgeDir')
    n.settle('D:\\work\\alpha')
    await Promise.resolve()
    await Promise.resolve()
    expect(n.dirCalls).toEqual(['D:\\work\\alpha']) // 对账请求 = 桥原样路径
    expect(n.events).toContain('apply:forgeDir') // 落值 = canonical 化后
  })

  it('取消（null）→ 零落值零错误（值不变；busy 相位完整回落）', async () => {
    const n = nativeHarness('X:')
    n.action('workspace')
    n.settle(null)
    await Promise.resolve()
    expect(n.events).toEqual(['error:null', 'busy:true', 'busy:false'])
    expect(n.events.some((event) => event.startsWith('apply:'))).toBe(false)
  })

  it('pick 失败（reject = 错误面）→ 错误文案回写 + 零落值（不改值）', async () => {
    const n = nativeHarness('X:')
    n.action('knowledgeDir')
    n.settle(new Error('E:\\gone 不可达'))
    await Promise.resolve()
    await Promise.resolve()
    expect(n.events).toContain('error:E:\\gone 不可达')
    expect(n.events).toContain('busy:false')
    expect(n.events.some((event) => event.startsWith('apply:'))).toBe(false)
  })

  it('对账失败（listDir 不可达）→ 同错误面（canonical 不造假）', async () => {
    const events: string[] = []
    const action = nativeBrowseAction({
      pick: () => Promise.resolve('E:\\gone'),
      dirSource: async () => {
        throw new Error('目录列举失败')
      },
      applyPick: () => {
        events.push('apply')
      },
      onError: (message) => {
        events.push(`error:${message ?? 'null'}`)
      },
    })
    action('forgeDir')
    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['error:null', 'error:目录列举失败'])
  })

  it('双击第二击 no-op（同步在途守卫——防双开系统对话框）', async () => {
    let invoked = 0
    const action = nativeBrowseAction({
      pick: () => {
        invoked += 1
        return Promise.resolve('D:\\a')
      },
      dirSource: async () => ({ path: 'D:\\a', parentPath: null, entries: [] }),
      applyPick: () => {},
    })
    action('forgeDir')
    action('forgeDir') // 在途第二击
    await Promise.resolve()
    await Promise.resolve()
    expect(invoked).toBe(1) // 恰一次 pick
  })
})
