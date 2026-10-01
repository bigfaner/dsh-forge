// 2.8 段一纯模型单测 —— 导航/选中/面包屑/已注册标记（AC1 路径正确 / AC2 ws_path 匹配 /
// AC3 单击选中唯一 + 未选中禁用 / AC4 拦截不出浏览器态=状态保持）。
import { describe, expect, it } from 'vitest'
import type { DirListing, ProjectSummary } from '@dsh-forge/contracts'
import {
  applyListing,
  canConfirm,
  crumbSegments,
  initialBrowserState,
  navigateTo,
  registeredPathsOf,
  selectEntry,
  selectionOf,
} from './browser-model.js'

function summary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return { id: 'p1', workspaceId: 'w1', name: 'demo', wsPath: 'Z:\\project\\demo', archived: false, ...overrides }
}

describe('导航态（AC1：双击进入 / 面包屑跳转路径正确）', () => {
  it('初始态：startDir 即 cwd（缺省 null = 首拉主目录）；无选中', () => {
    expect(initialBrowserState('Z:\\project')).toEqual({ cwd: 'Z:\\project', selected: null })
    expect(initialBrowserState()).toEqual({ cwd: null, selected: null })
  })

  it('导航（双击进入 / 面包屑 / 上一级同径）：cwd 即时切换 + 选中清零', () => {
    const state = selectEntry(initialBrowserState('Z:\\project'), 'Z:\\project\\dsh')
    expect(navigateTo(state, 'Z:\\project\\ai')).toEqual({ cwd: 'Z:\\project\\ai', selected: null })
    // 缺省目标 = 主目录（cwd 置空由 source 缺省请求承载）
    expect(navigateTo(state)).toEqual({ cwd: null, selected: null })
  })

  it('列举成功落位：cwd 对账 host canonical path（不信输入原样）+ 选中清零', () => {
    const listing: DirListing = {
      path: 'Z:\\project\\dsh',
      parentPath: 'Z:\\project',
      entries: [{ name: 'apps', path: 'Z:\\project\\dsh\\apps' }],
    }
    expect(applyListing(selectEntry({ cwd: 'z:\\PROJECT\\dsh', selected: 'x' }, 'x'), listing)).toEqual({
      cwd: 'Z:\\project\\dsh',
      selected: null,
    })
  })
})

describe('选中（AC3：单击选中唯一 / 未选中「下一步」禁用）', () => {
  it('单击选中 = 唯一覆盖（后选替换先选）', () => {
    const base = initialBrowserState('Z:\\project')
    const first = selectEntry(base, 'Z:\\project\\dsh')
    const second = selectEntry(first, 'Z:\\project\\ai')
    expect(second.selected).toBe('Z:\\project\\ai')
    expect(canConfirm(base)).toBe(false)
    expect(canConfirm(second)).toBe(true)
  })
})

describe('面包屑段（AC1：跳转目标路径正确；Windows 盘符主口径）', () => {
  it('盘符路径三级：段名与跳转目标逐级正确', () => {
    expect(crumbSegments('Z:\\project\\dsh')).toEqual([
      { name: 'Z:', path: 'Z:\\' },
      { name: 'project', path: 'Z:\\project' },
      { name: 'dsh', path: 'Z:\\project\\dsh' },
    ])
  })

  it('正斜杠输入同型（canonical 对账前的用户态输入）', () => {
    expect(crumbSegments('Z:/project')).toEqual([
      { name: 'Z:', path: 'Z:\\' },
      { name: 'project', path: 'Z:\\project' },
    ])
  })

  it('盘符根单段；POSIX 绝对路径兜底（跨平台口径）', () => {
    expect(crumbSegments('Z:\\')).toEqual([{ name: 'Z:', path: 'Z:\\' }])
    expect(crumbSegments('/home/user')).toEqual([
      { name: 'home', path: '/home' },
      { name: 'user', path: '/home/user' },
    ])
  })

  it('UNC 路径：首段 = 服务器名（目标 \\\\server），逐级拼接', () => {
    expect(crumbSegments('\\\\nas\\share\\docs')).toEqual([
      { name: 'nas', path: '\\\\nas' },
      { name: 'share', path: '\\\\nas\\share' },
      { name: 'docs', path: '\\\\nas\\share\\docs' },
    ])
  })

  it('空串 = 无段（防御：不炸不捏造）', () => {
    expect(crumbSegments('')).toEqual([])
  })
})

describe('已注册标记（AC2：ws_path 集合匹配 + 挂接语义预演）', () => {
  it('集合 = forge:projects/list 的 ws_path 全集（含 archived——对齐 core ① 预检：registry 按 canonical path，无 archived 维）', () => {
    const set = registeredPathsOf([
      summary(),
      summary({ id: 'p2', wsPath: 'Z:\\project\\legacy', archived: true }),
    ])
    expect(set.has('Z:\\project\\demo')).toBe(true)
    expect(set.has('Z:\\project\\legacy')).toBe(true)
    expect(set.has('Z:\\project\\other')).toBe(false)
  })

  it('确认载荷：命中项 registered=true（挂接语义——后续不登记补偿）；未命中 false', () => {
    const set = registeredPathsOf([summary()])
    expect(selectionOf('Z:\\project\\demo', set)).toEqual({ path: 'Z:\\project\\demo', registered: true })
    expect(selectionOf('Z:\\project\\fresh', set)).toEqual({ path: 'Z:\\project\\fresh', registered: false })
  })
})
