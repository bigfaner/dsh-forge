// CreateWorktreeDialog / DeleteWorktreeDialog 单测 —— 原型第五/六卡逐位对照：
// 表单体（CreateWorktreeFields）与状态清单体（DeleteChecksList）Modal 外提直测
// （官方 Modal 门户壳 SSR 不可达——apps/web AddProjectFlow.test 头注同口径惯例）；
// 弹窗壳闭态 + 拦截/派生纯函数同源覆盖。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CreateWorktreeFields,
  CreateWorktreeDialog,
  createFormPathPreview,
  deriveFormWorktreeName,
  initialCreateForm,
  type CreateWorktreeFormValue,
} from './create-worktree-dialog.js'
import { DeleteChecksList, DeleteWorktreeDialog } from './delete-worktree-dialog.js'
import { deriveWorktreeName, isCreateReady, isDeleteBlocked } from './model.js'

const FORM: CreateWorktreeFormValue = initialCreateForm('main', ['main', 'feat/a'])

const renderFields = (over: Partial<CreateWorktreeFormValue> = {}): string =>
  renderToStaticMarkup(
    <CreateWorktreeFields value={{ ...FORM, ...over }} branches={['main', 'feat/a', 'release/1.0']} worktreeDir="Z:/proj/.forge/worktrees" onChange={() => {}} />,
  )

describe('CreateWorktreeFields（原型「新建 worktree」卡三字段）', () => {
  it('三字段齐备：基准分支（默认 main + 下拉触发器）→ 分支主输入 → worktree 输入', () => {
    const markup = renderFields()
    expect(markup).toContain('data-dswt-field-base')
    expect(markup).toContain('data-dswt-field-branch')
    expect(markup).toContain('data-dswt-field-worktree')
    expect(markup).toContain('基准分支')
    expect(markup).toContain('（新分支的起点）')
    expect(markup).toContain('（自动派生，可改）')
    expect(markup).toContain('>main<')
  })

  it('路径预览行 = 所配 worktree 目录 + 「自定义路径…」入口（收起态无输入）', () => {
    const markup = renderFields()
    expect(markup).toContain('将创建于')
    expect(markup).toContain('Z:/proj/.forge/worktrees/')
    expect(markup).toContain('data-dswt-custom-path')
    expect(markup).not.toContain('data-dswt-custom-path-input')
  })

  it('自定义路径展开：路径预览切自定义输入（预览跟随 customPath）', () => {
    const markup = renderFields({ customPathOpen: true, customPath: 'D:/scratch/lab' })
    expect(markup).toContain('data-dswt-custom-path-input')
    expect(markup).toContain('D:/scratch/lab')
    expect(createFormPathPreview({ ...FORM, customPathOpen: true, customPath: 'D:/scratch/lab' }, 'Z:/proj/.forge/worktrees')).toBe('D:/scratch/lab')
  })
})

describe('派生规约（纯函数）', () => {
  it('feat/remote-approval → wt-remote-approval（未手改跟随派生）', () => {
    expect(deriveWorktreeName('feat/remote-approval')).toBe('wt-remote-approval')
    const form = { ...FORM, branch: 'feat/remote-approval' }
    expect(deriveFormWorktreeName(form)).toBe('wt-remote-approval')
  })
  it('手改 worktree 名即停跟随（派生可改）', () => {
    const form = { ...FORM, branch: 'feat/remote-approval', worktreeName: 'my-lab', worktreeTouched: true }
    expect(deriveFormWorktreeName(form)).toBe('my-lab')
  })
  it('创建钮门：分支名 + worktree 名齐备才 ready', () => {
    expect(isCreateReady('', 'wt-a')).toBe(false)
    expect(isCreateReady('feat/a', '')).toBe(false)
    expect(isCreateReady('feat/a', 'wt-a')).toBe(true)
  })
})

describe('CreateWorktreeDialog（弹窗壳）', () => {
  it('闭态不渲染（官方 Modal 返回 null 语义）', () => {
    expect(
      renderToStaticMarkup(
        <CreateWorktreeDialog open={false} branches={['main']} worktreeDir="Z:/p/.forge/worktrees" onClose={() => {}} onCreate={() => {}} />,
      ),
    ).toBe('')
  })
})

describe('DeleteChecksList（原型「删除二次确认」状态清单）', () => {
  const render = (checks: Parameters<typeof DeleteChecksList>[0]['checks']): string =>
    renderToStaticMarkup(<DeleteChecksList checks={checks} branch="feat/api" />)

  it('三检查项齐备', () => {
    const markup = render({ dirtyCount: 0, aheadCount: 0, attachedSessions: 0 })
    expect(markup).toContain('未提交变更')
    expect(markup).toContain('未 push 提交')
    expect(markup).toContain('挂靠会话')
  })

  it('双清：三检查项全 ok（✓）', () => {
    expect((render({ dirtyCount: 0, aheadCount: 0, attachedSessions: 0 }).match(/data-dswt-check="ok"/g) ?? [])).toHaveLength(3)
  })

  it('仅未 push 提交：警示行（warn ✓改 ✕ 语义）+ 引述 ahead 数——警示展示但放行', () => {
    const markup = render({ dirtyCount: 0, aheadCount: 2, attachedSessions: 0 })
    expect(markup).toContain('data-dswt-check="warn"')
    expect(markup).toContain('领先远端 2 个提交')
    expect(isDeleteBlocked({ dirtyCount: 0, aheadCount: 2, attachedSessions: 0 })).toBe(false)
  })

  it('未提交变更命中：block 行（拦截语义）', () => {
    const markup = render({ dirtyCount: 3, aheadCount: 0, attachedSessions: 0 })
    expect(markup).toContain('data-dswt-check="block"')
    expect(isDeleteBlocked({ dirtyCount: 3, aheadCount: 0, attachedSessions: 0 })).toBe(true)
  })

  it('挂靠会话命中（含 in-progress 任务语义）：block 行（拦截语义）', () => {
    const markup = render({ dirtyCount: 0, aheadCount: 0, attachedSessions: 1 })
    expect(markup).toContain('data-dswt-check="block"')
    expect(isDeleteBlocked({ dirtyCount: 0, aheadCount: 0, attachedSessions: 1 })).toBe(true)
  })

  it('detached 分支引述（branch=null → (detached)）', () => {
    const markup = renderToStaticMarkup(
      <DeleteChecksList branch={null} checks={{ dirtyCount: 0, aheadCount: 1, attachedSessions: 0 }} />,
    )
    expect(markup).toContain('(detached)')
  })
})

describe('DeleteWorktreeDialog（弹窗壳）', () => {
  it('闭态不渲染（官方 Modal 返回 null 语义）', () => {
    expect(
      renderToStaticMarkup(
        <DeleteWorktreeDialog
          open={false}
          worktreeName="wt-api"
          branch="feat/api"
          path="Z:/p/wt-api"
          checks={{ dirtyCount: 0, aheadCount: 0, attachedSessions: 0 }}
          onClose={() => {}}
          onConfirm={() => {}}
        />,
      ),
    ).toBe('')
  })
})
