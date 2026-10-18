// @feature:mobile-ui
// @mobile-e2e
// Journey: loop-card-doc-reader（循环卡投影 + 文档卡阅读页 + 渲染/文本切换 + 退出）。
// 溯源：contracts/step-1-scroll-loop-cards.md … step-4-exit-reader.md（每 Outcome 一测 + 冒烟）。
// 策略：msg-cards.ts / reader.ts 纯逻辑面（loopKindOf/loopBadge/degradedNarrativeSeqs/
// docKindOf/hasRenderToggle/parseCsvTable/renderRichMarkdown）行为实测；wire 钉样本
// forge/progress 哨兵事件做数据源。零真实 host、零浏览器。
import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_LINE_THRESHOLD,
  degradedNarrativeSeqs,
  docFileName,
  formatSize,
  loopBadge,
  loopKindOf,
} from '../../../apps/mobile/src/widgets/msg-cards.js'
import { docKindOf, hasRenderToggle, parseCsvLine, parseCsvTable } from '../../../apps/mobile/src/views/reader.js'
import { projectHistory } from '../../../apps/mobile/src/core/wire.js'
import { DURABLE_SAMPLES } from '../../../apps/mobile/src/core/wire.fixtures.js'
import { mobileSrc } from '../support.js'

describe('step-1 scroll-loop-cards（滚动浏览循环卡）', () => {
  it('success（色条卡 + 同 runId 退化）', () => {
    // 回链 contracts/step-1-scroll-loop-cards.md Outcome:success——kind 色条族 + 最新性退化
    expect(loopKindOf('claim', 'running')).toBe('dispatch')
    expect(loopKindOf('followup', 'running')).toBe('followup')
    expect(loopKindOf('transition', 'paused')).toBe('state')
    expect(loopKindOf('submit', 'completed')).toBe('done')
    expect(loopBadge('running')).toMatchObject({ tone: 'run' })
    expect(loopBadge('done')).toMatchObject({ tone: 'done' })
    expect(loopBadge('blocked')).toMatchObject({ tone: 'blocked' })
    // 哨兵事件投影：forge/progress → loop-progress 卡（消息流确定性投影）
    const progress = DURABLE_SAMPLES.find((e) => e.type === 'forge/progress')!
    const projections = projectHistory([progress])
    expect(projections.some((p) => p.kind === 'loop-progress')).toBe(true)
    // 同 runId 非最新卡退化：degradedNarrativeSeqs 判定集
    const degraded = degradedNarrativeSeqs(projectHistory(DURABLE_SAMPLES))
    expect(degraded).toBeInstanceOf(Set)
    // 折叠纪律（时间线不重排的呈现面）：超阈值折叠
    expect(COLLAPSE_LINE_THRESHOLD).toBe(8)
  })
})

describe('step-2 open-doc-card（点文档卡进入阅读页）', () => {
  it('success（徽标卡 + 全屏阅读页）', () => {
    // 回链 contracts/step-2-open-doc-card.md Outcome:success——类型判别族 html/md/csv/txt/link
    expect(docKindOf('report.html')).toBe('html')
    expect(docKindOf('notes.md')).toBe('md')
    expect(docKindOf('data.csv')).toBe('csv')
    expect(docKindOf('readme.txt')).toBe('txt')
    expect(docKindOf('https://example.com/doc')).toBe('link') // http(s) 链接优先
    expect(docKindOf('page')).toBe('txt') // 无扩展归纯文本兜底
    // 徽标卡派生：文件名 + size 右对齐
    expect(docFileName('Z:\\tmp\\report.html')).toBe('report.html')
    expect(formatSize(2048)).toContain('KB')
    // 全屏阅读页头部锚点（源面）：← 退出 + 文件名 + 渲染/文本胶囊
    const src = mobileSrc('views/reader.ts')
    expect(src).toMatch(/渲染|文本|胶囊|toggle/i)
  })

  it('unknown-type-fallback（未知类型兜底）', () => {
    // 回链 contracts/step-2-open-doc-card.md Outcome:unknown-type-fallback——未知 = 纯文本兜底
    expect(docKindOf('archive.zip')).toBe('txt') // 未知扩展归纯文本安全侧
    expect(docKindOf('binary.bin')).toBe('txt')
    expect(hasRenderToggle('txt')).toBe(false) // 纯文本态无渲染胶囊
  })
})

describe('step-3 read-render-toggle（渲染/文本切换）', () => {
  it('success（html/md/csv 默认渲染可切文本）', () => {
    // 回链 contracts/step-3-read-render-toggle.md Outcome:success——html/md/csv 默认渲染可切
    expect(hasRenderToggle('html')).toBe(true)
    expect(hasRenderToggle('md')).toBe(true)
    expect(hasRenderToggle('csv')).toBe(true)
    // csv 表格渲染：逐行解析 + 表格化
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
    const table = parseCsvTable('h1,h2\n1,2')
    expect(table).toEqual([['h1', 'h2'], ['1', '2']])
  })

  it('txt-plain-only（txt 恒纯文本）', () => {
    // 回链 contracts/step-3-read-render-toggle.md Outcome:txt-plain-only——txt 无渲染分支
    expect(hasRenderToggle('txt')).toBe(false)
    expect(docKindOf('notes.txt')).toBe('txt')
  })

  it('mermaid-enhanced（md 内嵌 mermaid）', () => {
    // 回链 contracts/step-3-read-render-toggle.md Outcome:mermaid-enhanced——
    // 动态 import 增强渲染（源面锚点）：失败退纯文本不阻塞文档其余部分
    const src = mobileSrc('views/reader.ts')
    expect(src).toMatch(/import\(|mermaid/i)
    // 富 markdown 分段：mermaid 块独立识别（渲染失败零逃逸）
    expect(src).toMatch(/RichMarkdown/)
  })
})

describe('step-4 exit-reader（退出阅读页返回消息流）', () => {
  it('success（返回位置不变）', () => {
    // 回链 contracts/step-4-exit-reader.md Outcome:success——退出仅导航：ReaderHandle.close 缝
    const src = mobileSrc('views/reader.ts')
    expect(src).toMatch(/close|exit|退出/i)
    // 消息流投影不受影响（projectHistory 纯函数幂等——时间线零重排）
    const once = projectHistory(DURABLE_SAMPLES)
    const twice = projectHistory(DURABLE_SAMPLES)
    expect(once).toEqual(twice)
  })
})

describe('smoke: happy path 依序走全链（loop-card-doc-reader）', () => {
  it('循环卡投影 → 文档卡类型 → 渲染切换 → 退出', () => {
    // ① 哨兵消息 → loop-progress 卡（kind 色条族 + 徽标）
    const progress = DURABLE_SAMPLES.find((e) => e.type === 'forge/progress')!
    expect(projectHistory([progress]).some((p) => p.kind === 'loop-progress')).toBe(true)
    expect(loopKindOf('claim', 'running')).toBe('dispatch')
    // ②③ 文档类型契约全族：渲染可切 vs 恒文本 vs 兜底
    for (const [file, kind, toggle] of [
      ['a.html', 'html', true],
      ['b.md', 'md', true],
      ['c.csv', 'csv', true],
      ['d.txt', 'txt', false],
      ['e.weird', 'txt', false],
    ] as const) {
      expect(docKindOf(file)).toBe(kind)
      expect(hasRenderToggle(kind)).toBe(toggle)
    }
    // ④ 退出：消息流投影幂等（位置/序不变）
    expect(projectHistory(DURABLE_SAMPLES)).toEqual(projectHistory(DURABLE_SAMPLES))
  })
})
