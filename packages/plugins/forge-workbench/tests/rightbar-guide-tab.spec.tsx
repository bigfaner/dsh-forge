// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuideTab, GuideTabTitle } from '../src/client/views/rightbar/GuideTab.tsx'
import type { GuideTabProps, GuideTabTitleProps } from '../src/client/views/rightbar/GuideTab.tsx'
import { en } from '../src/client/locale/en.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'

// M4 task 2.2 — AC2: the 开始页 body (the forge take-over of the door page):
// 罗盘水印 56px 无标题 + 三卡片 (项目概览/新建终端/浏览器, 标题/说明两行,
// 点击原位替换 replaceTab), and the 开始 chip title (compass + captured title).

// The upstream glyphs resolve through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps only the
// upstream monorepo supplies — the jsdom mount stubs them (project-seat.spec
// precedent; the real glyphs ride the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderClose16: () => <span data-mock-icon="folder" />,
  IconGlobeOutline14: () => <span data-mock-icon="globe" />,
}))

const t = (key: WorkbenchKey): string => en[key]

function mountGuide() {
  const openTab = vi.fn()
  const props = {
    t,
    useTabInfo: () => ({
      tab: { title: '开始', actions: { openTab } },
    }),
  } as unknown as GuideTabProps
  const view = render(<GuideTab {...props} />)
  return { view, openTab }
}

afterEach(cleanup)

describe('AC2: the 开始页 body', () => {
  it('renders the 56px compass watermark with NO heading copy', () => {
    const { view } = mountGuide()
    const watermark = view.container.querySelector('[data-dsh-forge-guide-watermark]') as HTMLElement
    // 56px 罗盘水印 (§4.1): the hero glyph is sized 56 and carries no text.
    expect(watermark.querySelector('svg')?.getAttribute('width')).toBe('56')
    expect(watermark.textContent).toBe('')
    expect(view.container.textContent).not.toContain(en['rightbar.tab.guide'])
  })

  it('renders the THREE cards — 项目概览/新建终端/浏览器 — each title + description two lines', () => {
    const { view } = mountGuide()
    for (const kind of ['overview', 'terminal', 'browser'] as const) {
      const card = view.container.querySelector(`[data-dsh-forge-guide-card="${kind}"]`) as HTMLElement
      expect(card.querySelector('[data-dsh-forge-guide-card-title]')?.textContent)
        .toBe(en[`rightbar.guide.${kind}.title` as WorkbenchKey])
      expect(card.querySelector('[data-dsh-forge-guide-card-description]')?.textContent)
        .toBe(en[`rightbar.guide.${kind}.description` as WorkbenchKey])
    }
    // Exactly three door cards — no preset fourth, no empty extras (SC2).
    expect(view.container.querySelectorAll('button[data-dsh-forge-guide-card]').length).toBe(3)
  })

  it('picking 项目概览 opens the OVERVIEW kind in place (原位替换 replaceTab)', () => {
    const { view, openTab } = mountGuide()
    fireEvent.click(view.container.querySelector('[data-dsh-forge-guide-card="overview"]') as HTMLElement)
    expect(openTab).toHaveBeenCalledWith('overview', { replaceTab: true })
  })

  it('picking 新建终端/浏览器 walks the upstream engine kinds (replaceTab, no new implementation)', () => {
    const { view, openTab } = mountGuide()
    fireEvent.click(view.container.querySelector('[data-dsh-forge-guide-card="terminal"]') as HTMLElement)
    fireEvent.click(view.container.querySelector('[data-dsh-forge-guide-card="browser"]') as HTMLElement)
    expect(openTab).toHaveBeenCalledWith('terminal', { replaceTab: true })
    expect(openTab).toHaveBeenCalledWith('browser', { replaceTab: true })
  })
})

describe('AC1: the 开始 chip title', () => {
  it('draws the compass before the captured title', () => {
    const props = {
      useTabInfo: () => ({ tab: { title: en['rightbar.tab.guide'] } }),
    } as unknown as GuideTabTitleProps
    const view = render(<GuideTabTitle {...props} />)
    const chip = view.container.querySelector('[data-dsh-forge-guide-title]') as HTMLElement
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(chip.textContent).toContain(en['rightbar.tab.guide'])
  })
})
