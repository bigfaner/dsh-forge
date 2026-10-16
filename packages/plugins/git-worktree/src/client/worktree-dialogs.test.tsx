// CreateWorktreeDialog / DeleteWorktreeDialog 单测 —— 原型第五/六卡逐位对照：
// 表单体（CreateWorktreeFields）与状态清单体（DeleteChecksList）Modal 外提直测
// （官方 Modal 门户壳 SSR 不可达——apps/web AddProjectFlow.test 头注同口径惯例）；
// 弹窗壳闭态 + 拦截/派生纯函数同源覆盖。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
import { createConflicts, isCreateReady, isDeleteBlocked, isWorktreeNameFollowing, sortBaseBranchOptions } from './model.js'

const FORM: CreateWorktreeFormValue = initialCreateForm('main', ['main', 'feat/a'])

const renderFields = (over: Partial<CreateWorktreeFormValue> = {}, conflicts: readonly string[] = []): string =>
  renderToStaticMarkup(
    <CreateWorktreeFields
      value={{ ...FORM, ...over }}
      branches={['main', 'feat/a', 'release/1.0']}
      conflicts={conflicts as never}
      worktreeDir="Z:/proj/.forge/worktrees"
      onChange={() => {}}
    />,
  )

describe('initialCreateForm（默认基准分支 = sortBaseBranchOptions 排序首项——1.23 默认与排序同源）', () => {
  it('defaultBranch 位序低于 main → 取排序首项 main（1.23 截图场景：不再单独取 defaultBranch/current）', () => {
    expect(initialCreateForm('trunk', ['main', 'trunk']).baseBranch).toBe('main')
  })

  it('current branch 非排序首项 → 默认不落到 current（同源断言：与排序产出首项逐位一致）', () => {
    const branches = ['dsh-forge-m1', 'main']
    expect(initialCreateForm(undefined, branches, 'dsh-forge-m1').baseBranch).toBe(
      sortBaseBranchOptions(branches, undefined, 'dsh-forge-m1')[0],
    )
    expect(initialCreateForm(undefined, branches, 'dsh-forge-m1').baseBranch).toBe('main')
  })

  it('main/master 缺席 → default 身份位生效：defaultBranch 在集内即排序首项', () => {
    expect(initialCreateForm('trunk', ['develop', 'trunk']).baseBranch).toBe('trunk')
    expect(initialCreateForm('feat/a', ['feat/a', 'feat/b']).baseBranch).toBe('feat/a')
  })

  it('defaultBranch 缺席 → 排序首项（main 优先于其余）；空清单 → main 占位', () => {
    expect(initialCreateForm(undefined, ['feat/a', 'main']).baseBranch).toBe('main')
    expect(initialCreateForm(undefined, []).baseBranch).toBe('main')
  })
})

describe('CreateWorktreeFields（原型「新建 worktree」卡三字段）', () => {
  it('三字段齐备：基准分支（默认 main + 下拉触发器）→ 分支主输入 → worktree 输入', () => {
    const markup = renderFields()
    expect(markup).toContain('data-dswt-field-base')
    expect(markup).toContain('data-dswt-field-branch')
    expect(markup).toContain('data-dswt-field-worktree')
    expect(markup).toContain('基准分支')
    expect(markup).toContain('（新分支的起点）')
    expect(markup).toContain('（默认与分支同名，可改）')
    expect(markup).toContain('>main<')
  })

  it('路径预览行 = 所配 worktree 目录 + 「自定义路径…」入口（收起态无输入；全串反斜杠口径）', () => {
    const markup = renderFields({ branch: 'feat/a', worktreeName: 'feat/a' })
    expect(markup).toContain('将创建于')
    expect(markup).toContain('data-dswt-path-value')
    expect(markup).toContain('Z:\\proj\\.forge\\worktrees\\feat\\') // 目录段（归一反斜杠——1.21）
    expect(markup).toContain('>a</span>') // 尾段（官方 PathLabel 同规格两分呈现）
    expect(markup).not.toContain('title=') // 1.21：PathLabel 内建原生 title 退役（官方 Tooltip 承载悬浮全文）
    expect(markup).toContain('data-dswt-custom-path')
    expect(markup).not.toContain('data-dswt-custom-path-input')
  })

  it('自定义路径展开：路径预览切自定义输入（预览跟随 customPath）', () => {
    const markup = renderFields({ customPathOpen: true, customPath: 'D:/scratch/lab' })
    expect(markup).toContain('data-dswt-custom-path-input')
    expect(markup).toContain('D:/scratch/lab')
    expect(createFormPathPreview({ ...FORM, customPathOpen: true, customPath: 'D:/scratch/lab' }, 'Z:/proj/.forge/worktrees')).toBe('D:/scratch/lab')
  })

  it('默认预览路径 = joinWorktreePath 归一（正斜杠目录输入 → 全串反斜杠——1.21 分隔符归一）', () => {
    expect(createFormPathPreview({ ...FORM, branch: 'feat/a', worktreeName: 'feat/a' }, 'Z:/proj/.forge/worktrees')).toBe('Z:\\proj\\.forge\\worktrees\\feat\\a')
  })

  it('说明行悬浮全文 = 官方 Tooltip（portal）+ PathLabel 退役（源面结构锚——读文件法，静态标记零气泡）', () => {
    const src = readFileSync(new URL('./create-worktree-dialog.tsx', import.meta.url), 'utf8')
    expect(src).toContain('<Tooltip')
    expect(src).toContain('portal')
    expect(src).not.toContain('<PathLabel')
  })
})

describe('分支 slug 下拉 + 同名冲突告警（提案裁决 2026-10-16）', () => {
  it('分支主输入 = 自由手写 Input + slug 下拉触发器（官方 Menu 锚定）', () => {
    const markup = renderFields()
    expect(markup).toContain('data-dswt-branch-input')
    expect(markup).toContain('data-dswt-branch-trigger')
  })

  it('分支同名冲突：表单内告警行（branch-exists → data-dswt-conflict-branch + 已存在）', () => {
    const markup = renderFields({ branch: 'feat/a' }, ['branch-exists'])
    expect(markup).toContain('data-dswt-conflict-branch')
    expect(markup).toContain('分支 feat/a 已存在')
  })

  it('worktree 名同名冲突：表单内告警行（worktree-exists → data-dswt-conflict-worktree）', () => {
    const markup = renderFields({ branch: 'feat/a' }, ['worktree-exists'])
    expect(markup).toContain('data-dswt-conflict-worktree')
    expect(markup).toContain('worktree feat/a 已存在')
  })

  it('无冲突：零告警行（拦截语义只对命中生效）', () => {
    const markup = renderFields({ branch: 'feat/new' })
    expect(markup).not.toContain('data-dswt-conflict-branch')
    expect(markup).not.toContain('data-dswt-conflict-worktree')
  })

  it('创建钮门：齐备 ∧ 零冲突（isCreateReady × createConflicts 组合）', () => {
    expect(isCreateReady('feat/a', 'wt-a') && createConflicts('feat/a', 'wt-a', ['feat/a'], []).length === 0).toBe(false)
    expect(isCreateReady('feat/b', 'wt-a') && createConflicts('feat/b', 'wt-a', ['feat/a'], ['wt-a']).length === 0).toBe(false)
    expect(isCreateReady('feat/b', 'wt-b') && createConflicts('feat/b', 'wt-b', ['feat/a'], ['wt-a']).length === 0).toBe(true)
  })
})

describe('分支组合框插槽（合并形态——slot 注入通用组合框，apps/web EditableCombobox 同形）', () => {
  const FakeCombobox = (props: { value: string; options: readonly { id: string }[] }): string =>
    renderToStaticMarkup(<div data-fake-combobox={props.value}>{props.options.map((option) => option.id).join(',')}</div>)

  it('注入 slot：分支行走组合框（全量候选 + placeholder 透传），无分离触发器', () => {
    const markup = renderToStaticMarkup(
      <CreateWorktreeFields
        value={FORM}
        branches={['main']}
        slugCandidates={[
          { slug: 'wt-a', done: false },
          { slug: 'old-proposal', done: true },
        ]}
        worktreeDir="Z:/p/.forge/worktrees"
        onChange={() => {}}
        BranchCombobox={FakeCombobox}
      />,
    )
    expect(markup).toContain('data-fake-combobox')
    expect(markup).toContain('wt-a,old-proposal')
    expect(markup).toContain('data-dswt-field-branch')
    expect(markup).not.toContain('data-dswt-branch-trigger')
  })

  it('过滤经 onFilter 注入（slot 收过滤回调而非预过滤清单）', () => {
    let filtered: string | null = null
    const ProbeCombobox = (props: { onFilter?: (query: string) => readonly { id: string }[] }): string => {
      filtered = (props.onFilter?.('wt') ?? []).map((option) => option.id).join(',')
      return ''
    }
    renderToStaticMarkup(
      <CreateWorktreeFields
        value={FORM}
        branches={['main']}
        slugCandidates={[
          { slug: 'wt-a', done: false },
          { slug: 'unrelated', done: true },
        ]}
        worktreeDir="Z:/p"
        onChange={() => {}}
        BranchCombobox={ProbeCombobox}
      />,
    )
    expect(filtered).toBe('wt-a')
  })
})

describe('同名默认跟随/脱离判定（1.20 纯函数单源 isWorktreeNameFollowing）', () => {
  it('未手改：worktree 名 = 分支名同名跟随（分支变化即同步）', () => {
    const form = { ...FORM, branch: 'feat/remote-approval' }
    expect(isWorktreeNameFollowing(form.branch, form.worktreeName, form.worktreeTouched)).toBe(true)
    expect(deriveFormWorktreeName(form)).toBe('feat/remote-approval')
    expect(deriveFormWorktreeName({ ...form, branch: 'feat/other' })).toBe('feat/other')
  })
  it('手改 worktree 名 → 脱离跟随（以用户值为准）', () => {
    const form = { ...FORM, branch: 'feat/remote-approval', worktreeName: 'my-lab', worktreeTouched: true }
    expect(isWorktreeNameFollowing(form.branch, form.worktreeName, form.worktreeTouched)).toBe(false)
    expect(deriveFormWorktreeName(form)).toBe('my-lab')
  })
  it('手改后清回分支同名值 → 恢复跟随判定（值 = 分支名）', () => {
    const form = { ...FORM, branch: 'feat/remote-approval', worktreeName: 'feat/remote-approval', worktreeTouched: true }
    expect(isWorktreeNameFollowing(form.branch, form.worktreeName, form.worktreeTouched)).toBe(true)
    expect(deriveFormWorktreeName(form)).toBe('feat/remote-approval')
    // 分支变化经 changeBranch（跟随态复位手改标记）→ worktree 名继续同名跟随
    const afterBranchChange = { ...form, branch: 'feat/next', worktreeTouched: false }
    expect(isWorktreeNameFollowing(afterBranchChange.branch, afterBranchChange.worktreeName, afterBranchChange.worktreeTouched)).toBe(true)
    expect(deriveFormWorktreeName(afterBranchChange)).toBe('feat/next')
  })
  it('创建钮门：分支名 + worktree 名齐备才 ready', () => {
    expect(isCreateReady('', 'wt-a')).toBe(false)
    expect(isCreateReady('feat/a', '')).toBe(false)
    expect(isCreateReady('feat/a', 'feat/a')).toBe(true)
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
