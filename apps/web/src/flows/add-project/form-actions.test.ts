// form-actions 单测 —— UF-3 段二交互转移面（AC4 联动两分支的动作级自证 + 浏览相位/取消
// 零副作用）。setState 同形内存替身直落转移语义（browser-actions.test 同形制）。
import { describe, expect, it } from 'vitest'
import type { BrowserSelection } from './browser-model.js'
import { formActions, type FormActions } from './form-actions.js'
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
