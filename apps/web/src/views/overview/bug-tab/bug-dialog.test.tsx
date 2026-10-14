// bug-dialog 单测（fix-bug Bug 详情弹框）—— 结构线框（状态行/summary/五字段 kv/证据区/
// 未修原因/人员/来源）+ 证据区·未修原因显隐 + 会话 pill 两态（命中 title 可点击 / 缺席
// fail-soft 回退 sessionId 不可点击）+ 拖移钳制纯函数复用（drawer/collapse 同刻度）。
import { describe, expect, it } from 'vitest'
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
