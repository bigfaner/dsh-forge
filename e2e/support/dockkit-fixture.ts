// dockkit 全屏/文档活动夹具注入（e2e 装置面——真机取证同款标记面）。
// 形态核销：cdp/super-composer-web-walkthrough-v4.mjs（1.8-r2 真机全绿驱动）——pane 携
// data-dockkit-pane + data-dockkit-content + 可选全屏标记 + 内嵌 [data-dswf-doc-panel]
// 文本体；有 dockkit surface 则挂 surface 内（真机径），无则挂 body（降级同型）。
// 双门满足面（plugins/super-composer/ui/index.ts render 可见性门控）：
//   · 全屏 DOM 兜底（fullscreen.ts DOM_FULLSCREEN_SELECTORS）——fullscreen 变体；
//   · 文档活动（document-activity.ts 可见 content 内文档体锚）——doc-panel 锚恒在。
// 背景：bare 全屏标记注入是 1.39 文档活动门控之前的装置形态，在现役门控下恒红
//（bug e796b658 归因）；本夹具与真机取证形态对齐。
import type { Page } from '@playwright/test'

/** 夹具文档体锚（划选源容器选择器——textContent 直读可划选） */
export const DOCKKIT_DOC_FIXTURE = '[data-dswf-doc-panel][data-dswf-doc-key="dswf-e2e-doc-fixture"]'

export interface DockkitDocFixtureOptions {
  /** 携带全屏标记（true = 直接触发替身挂载；false = 仅文档活动面，互斥基线 markers=0） */
  readonly fullscreen?: boolean
  /** 文档体内文本（划选源锚句） */
  readonly text?: string
}

/** 注入 dockkit 文档夹具（幂等：同 doc-key 已在场即跳过） */
export async function injectDockkitDocFixture(page: Page, opts: DockkitDocFixtureOptions = {}): Promise<void> {
  await page.evaluate(({ fullscreen, text }) => {
    if (document.querySelector('[data-dswf-doc-key="dswf-e2e-doc-fixture"]') !== null) return
    const pane = document.createElement('div')
    pane.setAttribute('data-dockkit-pane', '')
    pane.setAttribute('data-dockkit-content', 'dswf-e2e-doc-fixture')
    if (fullscreen) pane.setAttribute('data-sidebar-right-panel', 'fullscreen')
    const doc = document.createElement('div')
    doc.setAttribute('data-dswf-doc-panel', '')
    doc.setAttribute('data-dswf-doc-key', 'dswf-e2e-doc-fixture')
    if (text !== '') doc.textContent = text
    pane.appendChild(doc)
    // 挂 body（不挂 dockkit surface——surface 为 React 复管树，外挂 pane 文本会被
    // 复管清空（fix-2 探针实证 fixtText=''）；[data-dockkit-content] 判据为全 doc
    // 扫描，body 挂载同样满足文档活动门与全屏 DOM 兜底门。
    document.body.appendChild(pane)
  }, { fullscreen: opts.fullscreen ?? true, text: opts.text ?? '' })
}
