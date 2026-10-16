// bug-dialog 单测（fix-bug Bug 详情弹框）—— 结构线框（状态行/summary/五字段 kv/证据区/
// 未修原因/人员/来源）+ 证据区·未修原因显隐 + 会话 pill 两态（命中 title 可点击 / 缺席
// fail-soft 回退 sessionId 不可点击）+ 拖移钳制纯函数复用（drawer/collapse 同刻度）
// + 链时间线区（bug-recurrence-chain 1.7——mockup ②区逐位对照：题头/垂直轨道/定位词/
// 当前条高亮「本条」/recurrenceOf→前一条标注/同框切换锚/末节点无轨）。
import { describe, expect, it } from 'vitest'
// @ts-expect-error —— web tsconfig types 仅 vite/client；node:fs 仅测试内读取样式表源文
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BugCard, BugStatus } from '@dsh-forge/contracts'
import { DRAWER_DRAG_MARGIN, DRAWER_DRAG_TOP_FLOOR, drawerPositionFromDrag } from '../drawer/collapse.js'
import { BugDialog } from './bug-dialog.js'

const CREATED = '2026-10-13T09:30:00.000Z'

function bug(bugStatus: BugStatus, extra: Partial<BugCard> = {}): BugCard {
  return {
    bugId: 'b1',
    summary: '登录接口 500',
    bugDesc: '登录接口偶发 500，空 body 时必现',
    triggerDesc: 'POST /login 空 body',
    expected: '400 参数错误',
    actual: '500 内部错误',
    bugStatus,
    reporter: 'faner',
    createdAt: CREATED,
    updatedAt: CREATED,
    ...extra,
  }
}

function markupOf(card: BugCard, sessionTitleOf?: (sessionId: string) => string | undefined): string {
  return renderToStaticMarkup(
    <BugDialog bug={card} onClose={() => {}} {...(sessionTitleOf !== undefined ? { sessionTitleOf } : {})} />,
  )
}

describe('BugDialog（真 dialog 表单线框）', () => {
  it('壳 = dswf-ov-bdialog（非 drawer 皮）+ 宽 880 + 纵向滚动体；头 = Bug 详情 + ✕ 关闭锚', () => {
    const markup = markupOf(bug('open', { errorType: 'api' }))
    expect(markup).toContain('dswf-ov-bdialog')
    expect(markup).not.toContain('dswf-td-') // 真 dialog 自持皮——零 drawer 视觉类
    expect(markup).toContain('width:880px') // 440 两倍（用户裁决）
    expect(markup).toContain('data-dswf-ov-bdialog-body') // 滚动主区
    expect(markup).toContain('Bug 详情')
    expect(markup).toContain('data-dswf-ov-bdialog-close')
    // 摘要独立行（无 label 左对齐）+ 状态·错误类型 chips 右靠（表单行之外）
    expect(markup).toContain('dswf-ov-bdialog-summaryline')
    expect(markup).not.toContain('dswf-ov-bdialog-kv="summary"')
  })

  it('双列表单：摘要/状态/错误类型/五字段/登记时间（带年份）逐行 label+value', () => {
    const markup = markupOf(bug('open', { errorType: 'api' }))
    expect(markup).toContain('data-dswf-ov-bdialog-summary')
    expect(markup).toContain('登录接口 500')
    expect(markup).toContain('data-dswf-ov-bdialog-status="open"')
    expect(markup).toContain('data-dswf-ov-bdialog-type="api"')
    expect(markup).toContain('登录接口偶发 500，空 body 时必现')
    expect(markup).toContain('POST /login 空 body')
    expect(markup).toContain('400 参数错误')
    expect(markup).toContain('500 内部错误')
    expect(markup).toContain('data-dswf-ov-bdialog-kv="suspected"')
    expect(markup).toContain('—')
    expect(markup).toContain('2026-10-13 09:30') // 登记时间带年份（fullStampOf）
    expect(markup).not.toContain('dswf-td-kv-chip') // 旧 kv-chip 形态退役
  })

  it('发现人员 + 来源任务标识在场；fixer 缺席 = 修复行不渲染', () => {
    const markup = markupOf(bug('open', { sourceTaskId: 'task-uuid-1' }))
    expect(markup).toContain('data-dswf-ov-bdialog-reporter')
    expect(markup).toContain('faner')
    expect(markup).toContain('data-dswf-ov-bdialog-source')
    expect(markup).toContain('task-uuid-1')
    expect(markup).not.toContain('data-dswf-ov-bdialog-fixer')
  })
})

describe('BugDialog（证据区/未修原因显隐）', () => {
  it('fixed：证据区呈现（commit/worktree/branch + fixer），未修原因不渲染', () => {
    const markup = markupOf(
      bug('fixed', {
        commitHash: 'a1b2c3d',
        worktree: 'wt-x',
        branch: 'fix/x',
        fixer: 'faner',
        fixSessionId: 'sess-fix',
      }),
    )
    expect(markup).toContain('data-dswf-ov-bdialog-evidence')
    expect(markup).toContain('a1b2c3d')
    expect(markup).toContain('wt-x')
    expect(markup).toContain('fix/x')
    expect(markup).toContain('data-dswf-ov-bdialog-fixer')
    expect(markup).not.toContain('data-dswf-ov-bdialog-unresolved')
  })

  it('unresolved：未修原因呈现，证据区不渲染', () => {
    const markup = markupOf(bug('unresolved', { unresolvedReason: '仅 release 构建出现' }))
    expect(markup).toContain('data-dswf-ov-bdialog-unresolved')
    expect(markup).toContain('仅 release 构建出现')
    expect(markup).not.toContain('data-dswf-ov-bdialog-evidence')
  })

  it('fixed + fixApproach：修复方案行呈现（台账审查面）；open/fixed 缺席双隐', () => {
    const markup = markupOf(bug('fixed', { fixApproach: '事实落库取代 UI 启发式——spawn 审计行' }))
    expect(markup).toContain('data-dswf-ov-bdialog-fix-approach')
    expect(markup).toContain('事实落库取代 UI 启发式——spawn 审计行')
    expect(markupOf(bug('fixed'))).not.toContain('data-dswf-ov-bdialog-fix-approach')
    expect(markupOf(bug('open'))).not.toContain('data-dswf-ov-bdialog-fix-approach')
  })

  it('open：证据区与未修原因双隐', () => {
    const markup = markupOf(bug('open'))
    expect(markup).not.toContain('data-dswf-ov-bdialog-evidence')
    expect(markup).not.toContain('data-dswf-ov-bdialog-unresolved')
  })
})

describe('BugDialog（会话 pill 两态——sessionTitleOfOrId 契约）', () => {
  it('命中 = 可点击 title pill（data-dswf-ov-bsess + 会话名——onOpenSession 在场）', () => {
    const markup = renderToStaticMarkup(
      <BugDialog
        bug={bug('open', { reportSessionId: 'sess-r' })}
        onClose={() => {}}
        onOpenSession={() => {}}
        sessionTitleOf={(id) => (id === 'sess-r' ? '修复登录会话' : undefined)}
      />,
    )
    const at = markup.indexOf('data-dswf-ov-bsess="sess-r"')
    expect(at).toBeGreaterThan(-1)
    expect(markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))).toContain('修复登录会话')
  })

  it('缺席（解析器未命中/注入面缺席）= fail-soft 回退 sessionId 不可点击（非 button）', () => {
    const miss = markupOf(bug('open', { reportSessionId: 'sess-r' }), () => undefined)
    expect(miss).toContain('data-dswf-ov-bsess-id="sess-r"')
    expect(miss).not.toContain('data-dswf-ov-bsess=')
    const noInject = markupOf(bug('open', { reportSessionId: 'sess-r' }))
    expect(noInject).toContain('data-dswf-ov-bsess-id="sess-r"')
  })
})

describe('BugDialog（变更文件区——fixed 证据 commit 的文件清单 + 单文件 diff）', () => {
  const FILES = [
    { status: 'M', path: 'apps/web/src/a.tsx' },
    { status: 'A', path: 'apps/web/src/b.tsx' },
  ]
  const DIFF = 'diff --git a/a.tsx b/a.tsx\n+console.log(1)'

  /** fake rpc client（bugs.commitFiles/fileDiff 受控；makeClient 注入径——完整面桩缺省抛） */
  function fakeMakeClient(over: { files?: typeof FILES; diff?: string } = {}) {
    const calls: string[] = []
    const client = {
      bugs: {
        list: async () => [] as BugCard[],
        commitFiles: async (q: { commitHash: string }) => {
          calls.push(`commitFiles:${q.commitHash}`)
          return over.files ?? FILES
        },
        fileDiff: async (q: { path: string }) => {
          calls.push(`fileDiff:${q.path}`)
          return { diff: over.diff ?? DIFF }
        },
      },
    }
    return { makeClient: (() => client) as unknown as import('../../../rpc/index.js').RpcClientFactory, calls }
  }

  function renderFixed(props: { projectId?: string; makeClient?: import('../../../rpc/index.js').RpcClientFactory } = {}): string {
    return renderToStaticMarkup(
      <BugDialog
        bug={bug('fixed', { commitHash: 'a1b2c3d' })}
        onClose={() => {}}
        {...props}
      />,
    )
  }

  it('fixed + projectId = 变更控件在场；open/缺席 projectId = 不呈现（SSR 静态面零拉取）', () => {
    expect(renderFixed({ projectId: 'p-1' })).toContain('data-dswf-ov-bdialog-files')
    expect(renderFixed()).not.toContain('data-dswf-ov-bdialog-files')
    expect(renderToStaticMarkup(<BugDialog bug={bug('open', { commitHash: 'a1b2c3d' })} onClose={() => {}} projectId="p-1" />)).not.toContain(
      'data-dswf-ov-bdialog-files',
    )
  })

  it('拖移钳制纯函数与变更控件共存（既有拖移模型零回归——静态面锚）', () => {
    const { makeClient } = fakeMakeClient()
    const markup = renderToStaticMarkup(
      <BugDialog bug={bug('fixed', { commitHash: 'a1b2c3d' })} onClose={() => {}} projectId="p-1" makeClient={makeClient} />,
    )
    expect(markup).toContain('变更内容') // SSR 静态面未拉取——清单计数待展开首拍
    expect(markup).toContain('data-dswf-ov-bdialog-files-toggle')
  })
})

describe('BugDialog（拖移钳制——drawerPositionFromDrag 同刻度复用）', () => {
  it('视口钳制 4px 边距 + 标题栏恒可见（复用 drawer/collapse 刻度）', () => {
    const dragged = drawerPositionFromDrag({ left: 200, top: 100 }, 0, 0, -10_000, -10_000, 800, 600, 440)
    expect(dragged.left).toBe(DRAWER_DRAG_MARGIN)
    expect(dragged.top).toBe(DRAWER_DRAG_MARGIN)
    const floor = drawerPositionFromDrag({ left: 200, top: 100 }, 0, 0, 10_000, 10_000, 800, 600, 440)
    expect(floor.top).toBe(600 - DRAWER_DRAG_TOP_FLOOR - DRAWER_DRAG_MARGIN)
  })

  it('弹框壳 = 可拖动 dialog（标题栏拖移锚 + fixed 壳——任务弹窗同款模型）', () => {
    const markup = markupOf(bug('open'))
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('data-dswf-ov-bdialog-head')
  })
})

describe('BugDialog 链时间线（bug-recurrence-chain 1.7——mockup ②区逐位对照）', () => {
  const rootCard = bug('fixed', {
    bugId: 'b-root',
    summary: 'worker spawn 失败计数误增',
    createdAt: '2026-10-08T10:00:00.000Z',
    commitHash: 'c0a1e93abcdef',
    fixApproach: 'spawn 失败守卫改 3 连败停机\n后续审计行',
  })
  const r1Card = bug('fixed', {
    bugId: 'b-r1',
    recurrenceOf: 'b-root',
    summary: 'job_output 抽干竞态',
    createdAt: '2026-10-12T10:00:00.000Z',
    commitHash: 'c0b2f1aabcdef',
    fixApproach: '结算序号守卫旧拍不落点',
  })
  const r2Card = bug('open', {
    bugId: 'b-r2',
    recurrenceOf: 'b-r1',
    summary: '结算抽取后再挂起',
    createdAt: '2026-10-15T14:02:00.000Z',
  })
  const CHAIN = [rootCard, r1Card, r2Card]

  function chainMarkupOf(card: BugCard): string {
    return renderToStaticMarkup(<BugDialog bug={card} onClose={() => {}} chain={CHAIN} />)
  }

  it('单条 bug 零链区——既有表单行/880 宽零变化（现状语言不变）', () => {
    const markup = markupOf(bug('open'))
    expect(markup).not.toContain('data-dswf-ov-bdialog-chain')
    expect(markup).not.toContain('复发链')
    expect(markup).toContain('data-dswf-ov-bdialog-kv="bug"') // 五字段表单行原样
    expect(markup).toContain('width:880px')
  })

  it('链区位于摘要行下：题头「复发链（3 条 · 沿 recurrenceOf 回溯）」+ 垂直时间线（链根在上）', () => {
    const markup = chainMarkupOf(r2Card)
    expect(markup).toContain('复发链（3 条 · 沿 recurrenceOf 回溯）')
    expect(markup).toContain('data-dswf-ov-bdialog-chain')
    // 三节点 + 时间正序（链根在前）
    expect(markup).toContain('data-dswf-ov-bdialog-chain-node="b-root"')
    expect(markup).toContain('data-dswf-ov-bdialog-chain-node="b-r1"')
    expect(markup).toContain('data-dswf-ov-bdialog-chain-node="b-r2"')
    expect(markup.indexOf('data-dswf-ov-bdialog-chain-node="b-root"')).toBeLessThan(markup.indexOf('data-dswf-ov-bdialog-chain-node="b-r1"'))
    expect(markup.indexOf('data-dswf-ov-bdialog-chain-node="b-r1"')).toBeLessThan(markup.indexOf('data-dswf-ov-bdialog-chain-node="b-r2"'))
  })

  it('节点 = 状态点 + summary（定位词前缀）+ 状态 Tag + 日期 + commit 短哈希 + fixApproach 首行', () => {
    const markup = chainMarkupOf(r2Card)
    expect(markup).toContain('链根 · worker spawn 失败计数误增')
    expect(markup).toContain('复发① · job_output 抽干竞态')
    expect(markup).toContain('复发② · 结算抽取后再挂起')
    expect(markup).toContain('已修复')
    expect(markup).toContain('待修复')
    expect(markup).toContain('10-08 10:00')
    expect(markup).toContain('10-12 10:00')
    expect(markup).toContain('10-15 14:02')
    expect(markup).toContain('c0a1e93') // 7 位短哈希
    expect(markup).toContain('c0b2f1a')
    expect(markup).toContain('修法：spawn 失败守卫改 3 连败停机') // 首行（第二行不呈现）
    expect(markup).not.toContain('后续审计行')
    expect(markup).toContain('修法：结算序号守卫旧拍不落点')
  })

  it('当前条 = 打开条：底色高亮（is-cur）+「本条」标记 + recurrenceOf → 前一条定位词标注', () => {
    const markup = chainMarkupOf(r2Card)
    expect(markup).toContain('data-dswf-ov-bdialog-node-cur')
    expect(markup).toContain('is-cur')
    expect(markup).toContain('本条')
    expect(markup).toContain('recurrenceOf → 复发①')
    // 非当前条无「本条」/无 recurrenceOf 标注（仅一处分段安全断言：链根节点段内无）
    const rootAt = markup.indexOf('data-dswf-ov-bdialog-chain-node="b-root"')
    const rootSeg = markup.slice(rootAt, markup.indexOf('data-dswf-ov-bdialog-chain-node="b-r1"'))
    expect(rootSeg).not.toContain('本条')
  })

  it('同框切换：点其他节点切该条全卡（当前条随打开条重算——summary 行/kv 全量换卡）', () => {
    // 静态面：换打开条重渲染 = 链区当前条重算 + 全卡字段随该条（点击锚 role=button 键盘可达）
    const r1Markup = chainMarkupOf(r1Card)
    expect(r1Markup).toContain('data-dswf-ov-bdialog-node-cur="b-r1"')
    const markup = r1Markup
    expect(markup).toContain('job_output 抽干竞态')
    expect(markup).toContain('recurrenceOf → 链根') // 当前条前一条 = 链根
    const rootMarkup = chainMarkupOf(rootCard)
    expect(rootMarkup).toContain('data-dswf-ov-bdialog-node-cur="b-root"')
    expect(rootMarkup).not.toContain('recurrenceOf →') // 链根无前驱标注
    // 节点可点锚（同框切换交互词汇 = 行点击同款 role=button）
    expect(markup).toContain('data-dswf-ov-bdialog-chain-node="b-root" role="button"')
  })

  it('末节点无轨（css：rail ::after 末节点 display:none）+ 节点间 2px 竖轨', () => {
    const css = readFileSync(new URL('./bug-dialog.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.dswf-ov-bdialog-rail::after\s*\{[^}]*width:\s*2px/)
    expect(css).toMatch(/\.dswf-ov-bdialog-chain-node:last-child \.dswf-ov-bdialog-rail::after\s*\{[^}]*display:\s*none/)
    expect(css).toMatch(/\.dswf-ov-bdialog-chain-node\.is-cur \.dswf-ov-bdialog-nodebody\s*\{[^}]*background:\s*var\(/)
  })
})
