// DispatchToolRow 单测（2026-10-09 用户实机报障收口）——dispatchTask 对话工具行。
// 断言面：
//   AC-摘要段容器标识化（报障本体）：官方通用行参数摘要取「首个字符串值」= source_kind
//        种类词（proposal/feature）——本行改取 source_slug；缺席/漂移回退工具名单段；
//   AC-任务键后缀（用户裁决·结算后显示）：结算文本首行解析 slug/localId（✓ completed /
//        ⚑ blocked / ✗ ERR_SPAWN_FAILED 三形态）；在途/未领取（no-task/halted）不显；
//   AC-三相模型：preparing 单段不可展开 / start running / result ok·error·stopped
//        （interrupted）+ 窗口截断兜底（call 头缺席 → 摘要回退工具名）；
//   AC-渲染：标题 = locale 工具调用 + 摘要 + 任务键后缀；展开卡输入/输出双段 + 检视钮。
// 渲染断言经 renderToStaticMarkup（零 effect 同全仓口径——DispatchPanel.test 同径）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ForgeDispatchToolRow,
  dispatchResultTextOf,
  dispatchRowSummary,
  dispatchSourceSlugOf,
  dispatchTaskKeyOf,
  dispatchToolRowModel,
  type DispatchToolBlock,
  type ForgeDispatchToolRowProps,
} from './DispatchToolRow.js'

/** locale 座（zh 词典直查——plugin.ts FORGE_LOCALE_NS 同词） */
const T = (key: string): string =>
  (
    {
      'tool.dispatchTask.title': '工具调用',
      'tool.dispatchTask.preparing': '正在准备调用',
      'tool.dispatchTask.running': '运行中',
      'tool.dispatchTask.failed': '失败',
      'tool.dispatchTask.input': '输入',
      'tool.dispatchTask.output': '输出',
      'tool.dispatchTask.inspect': '查看',
    } as Record<string, string>
  )[key] ?? key

/** 展开钩子工厂（受控态注入——生产面 = slot runtime 递达） */
const disclosure = (expanded = false): (() => { expanded: boolean; toggle: () => void }) => {
  let open = expanded
  return () => ({
    get expanded() {
      return open
    },
    toggle: () => {
      open = !open
    },
  })
}

/** 行 props 工厂（三相块注入） */
const propsOf = (block: DispatchToolBlock, over: Partial<ForgeDispatchToolRowProps> = {}): ForgeDispatchToolRowProps => ({
  callId: 'call-1',
  toolName: 'dispatchTask',
  phase: block.phase ?? 'result',
  block,
  useDisclosure: disclosure(),
  t: T,
  ...over,
})

/** 派发参数原文工厂（source 对 = 容器限定认领） */
const argsOf = (slug: string | undefined, kind = 'proposal'): string =>
  slug === undefined ? '{}' : JSON.stringify({ source_kind: kind, source_slug: slug })

// ─────────────────── 摘要段（报障本体：种类词 → 容器标识） ───────────────────

describe('dispatchSourceSlugOf（参数原文 → 容器标识）', () => {
  it('source 对在场 → source_slug（首个字符串值恒为 source_kind 的官方通用行行为不复现）', () => {
    expect(dispatchSourceSlugOf(argsOf('dsh-forge-m3-1-ui-alignment'))).toBe('dsh-forge-m3-1-ui-alignment')
    expect(dispatchSourceSlugOf(argsOf('m2-pipeline', 'feature'))).toBe('m2-pipeline')
  })
  it('缺席（全库盲选空参）/非对象/解析失败/空串 → undefined（不猜不抛）', () => {
    expect(dispatchSourceSlugOf('{}')).toBeUndefined()
    expect(dispatchSourceSlugOf('not json')).toBeUndefined()
    expect(dispatchSourceSlugOf('[1,2]')).toBeUndefined()
    expect(dispatchSourceSlugOf('"plain"')).toBeUndefined()
    expect(dispatchSourceSlugOf('{"source_slug":""}')).toBeUndefined()
    expect(dispatchSourceSlugOf('{"source_kind":"proposal"}')).toBeUndefined() // 半对（防御面）
  })
})

describe('dispatchRowSummary（行摘要拼装）', () => {
  it('slug 在场 = `dispatchTask · {slug}`；缺席 = 工具名单段', () => {
    expect(dispatchRowSummary('dispatchTask', 'dsh-forge-m3-1-ui-alignment')).toBe(
      'dispatchTask · dsh-forge-m3-1-ui-alignment',
    )
    expect(dispatchRowSummary('dispatchTask', undefined)).toBe('dispatchTask')
  })
})

// ─────────────────── 任务键后缀（用户裁决：结算后显示） ───────────────────

describe('dispatchTaskKeyOf（结算文本首行 → 领取任务键）', () => {
  it('三首行形态解析（formatOk/formatErr 模板——契约测试 pin 面）', () => {
    expect(dispatchTaskKeyOf('✓ dsh-forge-m2-pipeline/4.2 completed — coding-feature · 已接线')).toBe(
      'dsh-forge-m2-pipeline/4.2',
    )
    expect(dispatchTaskKeyOf('⚑ m2-pipeline/5.1 blocked — eval 用例集冲突\n- pool: pending 0')).toBe('m2-pipeline/5.1')
    expect(dispatchTaskKeyOf('✗ ERR_SPAWN_FAILED — worker spawn failed for m2-pipeline/4.2: driver 缺席')).toBe(
      'm2-pipeline/4.2',
    )
  })
  it('no-task/halted（未领取）与 null → undefined；follow-up 行（非首行）不误取', () => {
    expect(dispatchTaskKeyOf('· no ready task (pool: pending 0 · in_progress 0 · blocked 0 · unmet-pending 0) — pool all settled — wrap up')).toBeUndefined()
    expect(dispatchTaskKeyOf('✗ dispatch halted — 3 consecutive spawn failures')).toBeUndefined()
    expect(dispatchTaskKeyOf(null)).toBeUndefined()
    expect(
      dispatchTaskKeyOf('⚑ m2-pipeline/5.1 blocked — 原因\n- follow-up fix task: m2-pipeline/fix-1 (dispatchable)'),
    ).toBe('m2-pipeline/5.1')
  })
  it('首行令牌非键形状（无双段斜杠）→ undefined（防御：模板漂移不猜）', () => {
    expect(dispatchTaskKeyOf('✓ something-odd completed — type')).toBeUndefined()
    expect(dispatchTaskKeyOf('worker spawn failed for odd: x')).toBeUndefined()
  })
})

// ─────────────────── 三相模型 ───────────────────

describe('dispatchToolRowModel（三相投影）', () => {
  it('preparing：单段工具名、不可展开（参数未齐——上游通用行同径）', () => {
    const m = dispatchToolRowModel('dispatchTask', { phase: 'preparing' })
    expect(m).toEqual({ state: 'preparing', summary: 'dispatchTask', taskKey: null, body: null, output: null, errorSummary: null })
  })
  it('start：running + 摘要容器标识 + pretty 输入段；任务键不显（就绪选择是工具内部行为）', () => {
    const m = dispatchToolRowModel('dispatchTask', { phase: 'start', argsRaw: argsOf('m3-1-ui-alignment') })
    expect(m.state).toBe('running')
    expect(m.summary).toBe('dispatchTask · m3-1-ui-alignment')
    expect(m.taskKey).toBeNull()
    expect(m.body).toBe('{\n  "source_kind": "proposal",\n  "source_slug": "m3-1-ui-alignment"\n}')
    expect(m.output).toBeNull()
  })
  it('result ok：结算文本 + 任务键后缀', () => {
    const block: DispatchToolBlock = {
      kind: 'tool-result',
      call: { name: 'dispatchTask', argsRaw: argsOf('m2-pipeline') },
      content: [{ type: 'text', text: '✓ m2-pipeline/4.2 completed — coding-feature\n- pool: pending 3 · in_progress 0 · blocked 0 · unmet-pending 1' }],
      isError: false,
    }
    const m = dispatchToolRowModel('dispatchTask', block)
    expect(m.state).toBe('ok')
    expect(m.taskKey).toBe('m2-pipeline/4.2')
    expect(m.output).toContain('✓ m2-pipeline/4.2 completed')
    expect(m.errorSummary).toBeNull()
  })
  it('result error：errorSummary = 输出首行；任务键仍在（ERR_SPAWN_FAILED 带 taskRef）', () => {
    const block: DispatchToolBlock = {
      kind: 'tool-result',
      call: { name: 'dispatchTask', argsRaw: argsOf('m2-pipeline') },
      content: [{ type: 'text', text: '✗ ERR_SPAWN_FAILED — worker spawn failed for m2-pipeline/4.2: boom\nretry: …' }],
      isError: true,
    }
    const m = dispatchToolRowModel('dispatchTask', block)
    expect(m.state).toBe('error')
    expect(m.errorSummary).toBe('✗ ERR_SPAWN_FAILED — worker spawn failed for m2-pipeline/4.2: boom')
    expect(m.taskKey).toBe('m2-pipeline/4.2')
  })
  it('result interrupted（error.code）→ stopped（上游状态口径）', () => {
    const block: DispatchToolBlock = {
      kind: 'tool-result',
      call: { name: 'dispatchTask', argsRaw: argsOf('m2-pipeline') },
      content: [{ type: 'text', text: '✓ m2-pipeline/4.2 completed — coding-feature' }],
      isError: true,
      error: { code: 'interrupted' },
    }
    expect(dispatchToolRowModel('dispatchTask', block).state).toBe('stopped')
  })
  it('窗口截断兜底：call 头缺席 → 摘要回退工具名单段 + 无输入段', () => {
    const block: DispatchToolBlock = {
      kind: 'tool-result',
      call: null,
      content: [{ type: 'text', text: '✓ m2-pipeline/4.2 completed — coding-feature' }],
      isError: false,
    }
    const m = dispatchToolRowModel('dispatchTask', block)
    expect(m.summary).toBe('dispatchTask')
    expect(m.body).toBeNull()
    expect(m.taskKey).toBe('m2-pipeline/4.2') // 结算文本仍在（任务键可得）
  })
})

describe('dispatchResultTextOf（结算文本投影）', () => {
  it('text 块拼接 + 非 text 块 JSON 化 + 空内容带 error 对象回退 name: code（SkillRow 同径）', () => {
    expect(
      dispatchResultTextOf({
        kind: 'tool-result',
        call: null,
        content: [
          { type: 'text', text: '✓ a/1 completed' },
          { type: 'image', image: 'x' } as never,
        ],
        isError: false,
      }),
    ).toContain('✓ a/1 completed')
    expect(dispatchResultTextOf({ kind: 'tool-result', call: null, content: [], isError: true, error: { name: 'SpawnError', code: 'ERR_SPAWN_FAILED' } })).toBe(
      'SpawnError: ERR_SPAWN_FAILED',
    )
    expect(dispatchResultTextOf({ kind: 'tool-result', call: null, content: [], isError: false })).toBeNull()
  })
})

// ─────────────────── 渲染体（静态 markup 断言） ───────────────────

describe('ForgeDispatchToolRow 渲染', () => {
  it('折叠行：标题 + 点隔符 + `dispatchTask · {slug}` 摘要 + 状态锚；源 kind 词不出现在摘要段', () => {
    const html = renderToStaticMarkup(
      <ForgeDispatchToolRow
        {...propsOf({ phase: 'start', argsRaw: argsOf('dsh-forge-m3-1-ui-alignment') })}
      />,
    )
    expect(html).toContain('工具调用')
    expect(html).toContain('dispatchTask · dsh-forge-m3-1-ui-alignment')
    expect(html).not.toContain('dispatchTask · proposal') // 报障回归 pin：种类词退役
    expect(html).toContain('data-dswf-dtr')
    expect(html).toContain('data-state="running"')
    expect(html).not.toContain('data-dswf-dtr-taskkey') // 在途无任务键
  })
  it('结算行：任务键后缀在场（slug/localId）；错误态错误摘要着色', () => {
    const okHtml = renderToStaticMarkup(
      <ForgeDispatchToolRow
        {...propsOf({
          kind: 'tool-result',
          call: { name: 'dispatchTask', argsRaw: argsOf('m2-pipeline') },
          content: [{ type: 'text', text: '✓ m2-pipeline/4.2 completed — coding-feature' }],
          isError: false,
        })}
      />,
    )
    expect(okHtml).toContain('data-dswf-dtr-taskkey')
    expect(okHtml).toContain('m2-pipeline/4.2')
    expect(okHtml).toContain('data-state="ok"')
    const errHtml = renderToStaticMarkup(
      <ForgeDispatchToolRow
        {...propsOf({
          kind: 'tool-result',
          call: { name: 'dispatchTask', argsRaw: argsOf('m2-pipeline') },
          content: [{ type: 'text', text: '✗ ERR_SPAWN_FAILED — worker spawn failed for m2-pipeline/4.2: boom\nretry: …' }],
          isError: true,
        })}
      />,
    )
    expect(errHtml).toContain('is-error')
    expect(errHtml).toContain('data-state="error"')
    expect(errHtml).toContain('m2-pipeline/4.2') // 错误态任务键仍可见
  })
  it('全库盲选（空参）：摘要回退工具名单段（无 ` · ` 连接）', () => {
    const html = renderToStaticMarkup(
      <ForgeDispatchToolRow {...propsOf({ phase: 'start', argsRaw: '{}' })} />,
    )
    expect(html).toContain('dispatchTask')
    expect(html).not.toContain('dispatchTask ·')
  })
  it('展开（expanded 注入）：ioCard 输入/输出双段 + 检视钮；inspect 缺席不渲染钮', () => {
    const block: DispatchToolBlock = {
      kind: 'tool-result',
      call: { name: 'dispatchTask', argsRaw: argsOf('m2-pipeline') },
      content: [{ type: 'text', text: '✓ m2-pipeline/4.2 completed — coding-feature' }],
      isError: false,
    }
    const open = renderToStaticMarkup(
      <ForgeDispatchToolRow
        {...propsOf(block, { useDisclosure: disclosure(true), inspect: () => {} })}
      />,
    )
    expect(open).toContain('输入')
    expect(open).toContain('source_slug') // pretty 参数
    expect(open).toContain('输出')
    expect(open).toContain('✓ m2-pipeline/4.2 completed')
    expect(open).toContain('查看')
    const noInspect = renderToStaticMarkup(
      <ForgeDispatchToolRow {...propsOf(block, { useDisclosure: disclosure(true) })} />,
    )
    expect(noInspect).not.toContain('查看')
  })
  it('preparing：不可展开单段行（无 data-expandable）+ 无障碍状态文案', () => {
    const html = renderToStaticMarkup(<ForgeDispatchToolRow {...propsOf({ phase: 'preparing' })} />)
    expect(html).toContain('data-state="preparing"')
    expect(html).toContain('正在准备调用')
    expect(html).not.toContain('data-expandable')
  })
})
