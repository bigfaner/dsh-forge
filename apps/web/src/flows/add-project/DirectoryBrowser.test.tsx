// DirectoryBrowser 单测 —— UF-3 段一（AC1 面包屑/行结构 / AC2 已注册标记 / AC3 选中唯一 +
// 未选中禁用 / AC4 错误条不出浏览器态 / AC5 官方件在场）。renderToStaticMarkup 纯渲染面
// （同 2.6/2.7 组件测法）；导航/选中转移的语义面在 browser-model.test、数据源在 dir-source.test。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DirListing } from '@dsh-forge/contracts'
import { DirectoryBrowser, DirectoryBrowserView } from './DirectoryBrowser.js'
import { initialBrowserState, selectEntry } from './browser-model.js'
import type { ListingPhase } from './dir-source.js'

const LISTING: DirListing = {
  path: 'Z:\\project',
  parentPath: 'Z:\\',
  entries: [
    { name: 'ai', path: 'Z:\\project\\ai' },
    { name: 'dsh', path: 'Z:\\project\\dsh' },
    { name: 'legacy', path: 'Z:\\project\\legacy' },
  ],
}
const READY: ListingPhase = { phase: 'ready', listing: LISTING }
const REGISTERED = new Set(['Z:\\project\\dsh'])

function view(overrides: Partial<Parameters<typeof DirectoryBrowserView>[0]> = {}): string {
  const props: Parameters<typeof DirectoryBrowserView>[0] = {
    nav: initialBrowserState('Z:\\project'),
    phase: READY,
    registeredPaths: REGISTERED,
    confirmLabel: '下一步',
    hint: '单击选中，双击进入',
    ...overrides,
  }
  return renderToStaticMarkup(<DirectoryBrowserView {...props} />)
}

describe('ready 相位（AC1：目录列举 + 面包屑路径）', () => {
  const markup = view()

  it('列表行三件：官方文件夹图标 + 名称 + data-dswf-path 路径锚', () => {
    expect(markup).toContain('data-dswf-fb="browser"')
    expect(markup).toContain('role="listbox"')
    expect(markup).toContain('data-dswf-path="Z:\\project\\ai"')
    expect(markup).toContain('>ai</span>')
    expect(markup).toContain('>dsh</span>')
  })

  it('面包屑 = 逐级段（非当前段可跳转，当前段 aria-current）+ 上一级钮（父目录在场可用）', () => {
    const deep = view({ nav: initialBrowserState('Z:\\project\\dsh') })
    expect(deep).toContain('data-dswf-jump="Z:\\') // 盘符根段可跳（跳转目标 = 逐级前缀）
    expect(deep).toContain('data-dswf-jump="Z:\\project"') // 中间段可跳
    expect(markup).toContain('aria-label="目录位置"')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('aria-label="上一级"')
  })

  it('空目录 → 空文件夹占位（不出错态）', () => {
    const empty = view({
      phase: { phase: 'ready', listing: { ...LISTING, entries: [] } },
    })
    expect(empty).toContain('空文件夹')
    expect(empty).not.toContain('data-dswf-fb-error')
  })
})

describe('已注册标记（AC2：ws_path 命中行级标记）', () => {
  it('命中行带「已注册」chip + data-registered；未命中行无标记', () => {
    const markup = view()
    expect(markup).toContain('data-registered')
    expect(markup).toContain('已注册')
    // 命中 = 仅 dsh 行（ai/legacy 行不带 data-registered——断言计数）
    expect(markup.match(/data-registered/g)?.length).toBe(1)
    expect(markup).toContain('data-dswf-path="Z:\\project\\dsh"')
  })
})

describe('选中与确认（AC3：单击选中唯一 / 未选中「下一步」禁用）', () => {
  it('未选中：无 aria-selected=true 行；「下一步」禁用 + 提示锚（官方 Tooltip label——D30 原生 title 退役）', () => {
    const markup = view()
    expect(markup).not.toContain('aria-selected="true"')
    expect(markup).toContain('disabled=""')
    expect(markup).not.toContain('title=') // D30：「先在列表中选中一个文件夹」确认态说明归官方 Tooltip label（结构 pin tests/structure/d30）
  })

  it('选中：恰一行 aria-selected=true + data-selected（唯一）；「下一步」解禁', () => {
    const markup = view({ nav: selectEntry(initialBrowserState('Z:\\project'), 'Z:\\project\\dsh') })
    expect(markup.match(/aria-selected="true"/g)?.length).toBe(1)
    expect(markup).toContain('data-selected')
    expect(markup).not.toContain('title=') // D30：crumb 路径（nav.cwd）悬停归官方 Tooltip label（原生 title 退役）
    expect(markup).not.toContain('disabled') // 选中后确认解禁（父目录在场，上一级亦可用）
  })
})

describe('错误条相位（AC4：不存在/不可达拦截，不出浏览器态）', () => {
  it('错误条在场：role=alert + 归一消息 + 重试；浏览器结构保持（面包屑条/列表容器）', () => {
    const markup = view({
      phase: { phase: 'error', message: '目录不可达：Z:\\gone（ENOENT）' },
      onRetry: () => {},
    })
    expect(markup).toContain('data-dswf-fb-error')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('目录不可达：Z:\\gone（ENOENT）')
    expect(markup).toContain('重试')
    // 浏览器态三件仍在场（拦截 ≠ 切出浏览器）
    expect(markup).toContain('aria-label="目录位置"')
    expect(markup).toContain('role="listbox"')
    expect(markup).toContain('下一步')
    // 错误相位无父目录 → 上一级禁用
    expect(markup).toContain('disabled=""')
  })
})

describe('装配壳（数据源注入：初始 loading 相位 + 复用参数）', () => {
  it('DirectoryBrowser 初始渲染 = loading 骨架（首拉未落位不闪空态/错误）', () => {
    const markup = renderToStaticMarkup(
      <DirectoryBrowser source={() => new Promise<DirListing>(() => {})} />,
    )
    expect(markup).toContain('data-dswf-fb-skeleton')
    expect(markup).toContain('aria-hidden="true"')
  })

  it('2.9 复用面：confirmLabel 参数化（「选择此文件夹」）+ 默认「下一步」', () => {
    expect(view({ confirmLabel: '选择此文件夹' })).toContain('选择此文件夹')
    expect(view()).toContain('下一步')
  })
})
