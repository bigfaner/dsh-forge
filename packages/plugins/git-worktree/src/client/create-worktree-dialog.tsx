// @dsh-forge/git-worktree client —— 新建 worktree 弹窗（原型第六卡逐位对照）：
// 官方 Modal + 三字段自上而下——① 基准分支（默认 main，可下拉）→ ② 分支（主输入）→
// ③ worktree（自动派生，可改）；路径行 = 所配 worktree 目录预览 + 「自定义路径…」；
// 入口只说一个名词「新建 worktree…」——分支与 worktree 一体感由派生交互承载。
// 表单状态面（CreateWorktreeFields/initialCreateForm）Modal 外提——单测直测
// （官方 Modal 门户壳 SSR 不可达——apps/web AddProjectFlow.test 头注同口径）。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Input, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconBranchOutlineRegular, IconChevronDownOutlineRegular } from './icons.js'
import { deriveWorktreeName, isCreateReady } from './model.js'

/** 创建请求（git 一体创建 = 新分支 + 新 worktree 一次落位） */
export interface CreateWorktreeRequest {
  /** 基准分支（新分支的起点，默认 main） */
  readonly baseBranch: string
  /** 新分支名（唯一主输入） */
  readonly branch: string
  /** worktree 名（派生可改） */
  readonly worktreeName: string
  /** 自定义路径（未自定义 = undefined——装配层落所配 worktree 目录） */
  readonly customPath?: string | undefined
}

/** 表单状态（三字段 + 自定义路径开合/值——受控面，弹窗与单测共用） */
export interface CreateWorktreeFormValue {
  readonly baseBranch: string
  readonly branch: string
  readonly worktreeName: string
  readonly worktreeTouched: boolean
  readonly customPathOpen: boolean
  readonly customPath: string
  readonly baseOpen: boolean
}

/** 初始表单（弹窗打开即重置——基准分支回默认、派生链复位） */
export function initialCreateForm(defaultBranch: string | undefined, branches: readonly string[]): CreateWorktreeFormValue {
  return {
    baseBranch: defaultBranch ?? branches[0] ?? 'main',
    branch: '',
    worktreeName: '',
    worktreeTouched: false,
    customPathOpen: false,
    customPath: '',
    baseOpen: false,
  }
}

/**
 * 派生规约（纯函数）：worktree 名未手改前跟随分支名派生（feat/ 前缀映射 wt-，尾段
 * 补前缀）；用户改过即停跟随（派生可改）。
 */
export function deriveFormWorktreeName(form: CreateWorktreeFormValue): string {
  return form.worktreeTouched ? form.worktreeName : deriveWorktreeName(form.branch)
}

/** 路径预览（自定义路径开且非空 = 自定义值；否则 = 所配目录/派生名） */
export function createFormPathPreview(form: CreateWorktreeFormValue, worktreeDir: string): string {
  return form.customPathOpen && form.customPath !== '' ? form.customPath : `${worktreeDir}/${form.worktreeName}`
}

export interface CreateWorktreeFieldsProps {
  readonly value: CreateWorktreeFormValue
  /** 分支清单（基准分支下拉数据源——git for-each-ref refs/heads） */
  readonly branches: readonly string[]
  /** 所配 worktree 目录（路径预览行——未自定义时「将创建于 …」） */
  readonly worktreeDir: string
  readonly onChange: (value: CreateWorktreeFormValue) => void
}

const fieldLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--dsw-alias-label-primary)',
  marginBottom: 6,
}
const fieldOpt: React.CSSProperties = {
  fontWeight: 400,
  color: 'var(--dsw-alias-label-caption)',
  fontSize: 12,
}
const mono = { fontFamily: 'var(--ds-font-family-code, monospace)' } satisfies React.CSSProperties
const inputStyle: React.CSSProperties = { ...mono, height: 34, width: '100%', fontSize: 13 }
/** 等宽拉伸面：官方 Input 的 style 落在内部 <input>，可见描边盒是外层 inline-flex
 * .wrap span（shrink-to-fit）——列向 flex 面内 stretch 把 .wrap 拉满容器宽，三字段
 * 与基准分支触发器共用同一列宽基准（等宽 + 左缘对齐；Menu 根 inline-flex 同理）。 */
const fieldStretch: React.CSSProperties = { display: 'flex', flexDirection: 'column' }

/** 三字段表单体（官方 Input/Menu 形态——弹窗 body 内容，Modal 外提单测面） */
export function CreateWorktreeFields({
  value: form,
  branches,
  worktreeDir,
  onChange,
}: CreateWorktreeFieldsProps): ReactNode {
  const baseItems = useMemo(() => branches.map((id) => ({ id, label: id })), [branches])
  const worktreeName = deriveFormWorktreeName(form)
  return (
    <>
      <div data-dswt-field-base="" style={{ marginBottom: 14 }}>
        <div style={fieldLabel}>
          基准分支 <span style={fieldOpt}>（新分支的起点）</span>
        </div>
        {/* 官方 Menu 根为 inline-flex（Menu.module.css .root）——fieldStretch 拉满容器宽 */}
        <div style={fieldStretch}>
          <Menu
            open={form.baseOpen}
            anchor={
              <button
                type="button"
                data-dswt-base-trigger=""
                onClick={() => {
                  onChange({ ...form, baseOpen: !form.baseOpen })
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  height: 34,
                  padding: '0 10px',
                  border: '0.5px solid var(--dsw-alias-border-l2)',
                  borderRadius: 8,
                  background: 'var(--dsw-alias-bg-layer-1)',
                  fontSize: 13,
                  color: 'var(--dsw-alias-label-primary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <IconBranchOutlineRegular size={14} />
                <span style={mono}>{form.baseBranch}</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)' }}>
                  <IconChevronDownOutlineRegular size={14} />
                </span>
              </button>
            }
            items={baseItems}
            selectedId={form.baseBranch}
            onSelect={(id) => {
              onChange({ ...form, baseBranch: id, baseOpen: false })
            }}
            onClose={() => {
              onChange({ ...form, baseOpen: false })
            }}
            listClassName="dswt-base-branch-menu"
          />
        </div>
      </div>

      <div data-dswt-field-branch="" style={{ marginBottom: 14 }}>
        <div style={fieldLabel}>分支</div>
        <div style={fieldStretch}>
          <Input
            data-dswt-branch-input=""
            value={form.branch}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              onChange({ ...form, branch: event.currentTarget.value })
            }}
            style={inputStyle}
            placeholder="feat/my-branch"
          />
        </div>
      </div>

      <div data-dswt-field-worktree="">
        <div style={fieldLabel}>
          worktree <span style={fieldOpt}>（自动派生，可改）</span>
        </div>
        <div style={fieldStretch}>
          <Input
            data-dswt-worktree-input=""
            value={worktreeName}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              onChange({ ...form, worktreeName: event.currentTarget.value, worktreeTouched: true })
            }}
            style={inputStyle}
          />
        </div>
        <div data-dswt-path-preview="" style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 6 }}>
          将创建于{' '}
          <span style={{ ...mono, color: 'var(--dsw-alias-label-secondary)' }}>
            {createFormPathPreview({ ...form, worktreeName }, worktreeDir)}
          </span>
          {form.customPathOpen ? null : (
            <>
              {'　'}
              <a
                href="#custom-path"
                data-dswt-custom-path=""
                onClick={(event) => {
                  event.preventDefault()
                  onChange({ ...form, customPathOpen: true })
                }}
                style={{ color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer' }}
              >
                自定义路径…
              </a>
            </>
          )}
        </div>
        {form.customPathOpen && (
          <div style={{ ...fieldStretch, marginTop: 6 }}>
            <Input
              data-dswt-custom-path-input=""
              value={form.customPath}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ ...form, customPath: event.currentTarget.value })
              }}
              placeholder="自定义 worktree 路径"
              style={inputStyle}
            />
          </div>
        )}
      </div>
    </>
  )
}

export interface CreateWorktreeDialogProps {
  readonly open: boolean
  readonly branches: readonly string[]
  /** 基准分支默认值（主 worktree 判定/origin 默认分支——装配层给） */
  readonly defaultBranch?: string | undefined
  /** 所配 worktree 目录（路径预览行——未自定义时「将创建于 …」） */
  readonly worktreeDir: string
  readonly onClose: () => void
  readonly onCreate: (request: CreateWorktreeRequest) => void
}

/**
 * 新建 worktree 弹窗（官方 Modal；contentClassName = .dswt-create-dialog 走查锚）。
 * 「创建」钮门 = isCreateReady（分支名 + worktree 名齐备）。
 */
export function CreateWorktreeDialog({
  open,
  branches,
  defaultBranch,
  worktreeDir,
  onClose,
  onCreate,
}: CreateWorktreeDialogProps): ReactNode {
  const [form, setForm] = useState<CreateWorktreeFormValue>(() => initialCreateForm(defaultBranch, branches))
  useEffect(() => {
    if (open) setForm(initialCreateForm(defaultBranch, branches))
  }, [open, defaultBranch, branches])
  const worktreeName = deriveFormWorktreeName(form)
  const ready = isCreateReady(form.branch, worktreeName)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建 worktree"
      closeLabel="关闭"
      contentClassName="dswt-create-dialog"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            data-dswt-create-submit=""
            disabled={!ready}
            onClick={() => {
              onCreate({
                baseBranch: form.baseBranch,
                branch: form.branch.trim(),
                worktreeName: worktreeName.trim(),
                customPath: form.customPathOpen && form.customPath.trim() !== '' ? form.customPath.trim() : undefined,
              })
            }}
          >
            创建
          </Button>
        </>
      }
    >
      <CreateWorktreeFields value={form} branches={branches} worktreeDir={worktreeDir} onChange={setForm} />
    </Modal>
  )
}
