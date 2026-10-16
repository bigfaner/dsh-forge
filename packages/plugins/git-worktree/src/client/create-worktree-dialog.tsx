// @dsh-forge/git-worktree client —— 新建 worktree 弹窗（原型第六卡逐位对照）：
// 官方 Modal + 三字段自上而下——① 基准分支（默认 main，可下拉）→ ② 分支（主输入）→
// ③ worktree（默认与分支同名跟随，可改）；路径行 = 所配 worktree 目录预览 + 「自定义路径…」；
// 入口只说一个名词「新建 worktree…」——分支与 worktree 一体感由派生交互承载。
// 分支主输入 = 自由手写 + slug 智能下拉（提案/feature slug 候选、未完成排前、去重、
// 输入过滤）；合并形态经 BranchCombobox slot 注入通用组合框（apps/web EditableCombobox），
// 缺省保留分离实现与 data-dswt-* 锚；同名冲突（分支 vs branches RPC、worktree 名 vs
// list RPC）→ 表单内告警 + 创建钮禁用（进 git 前拦截）。
// 表单状态面（CreateWorktreeFields/initialCreateForm）Modal 外提——单测直测
// （官方 Modal 门户壳 SSR 不可达——apps/web AddProjectFlow.test 头注同口径）。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Input, Menu, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconBranchOutlineRegular, IconChevronDownOutlineRegular, IconWarningTriangleOutlineRegular } from './icons.js'
import { WorktreeRiskConfirmation } from './risk-confirmation.js'
import { createConflicts, filterSlugCandidates, isCreateReady, isCrossBranchRisk, isWorktreeNameFollowing, joinWorktreePath, sortBaseBranchOptions, type CreateConflict, type SlugCandidate } from './model.js'

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

/** 表单状态（三字段 + 自定义路径开合/值 + 两下拉开合——受控面，弹窗与单测共用） */
export interface CreateWorktreeFormValue {
  readonly baseBranch: string
  readonly branch: string
  readonly worktreeName: string
  readonly worktreeTouched: boolean
  readonly customPathOpen: boolean
  readonly customPath: string
  readonly baseOpen: boolean
  readonly branchOpen: boolean
}

/** 初始表单（弹窗打开即重置——基准分支回默认、派生链复位）。默认基准分支与下拉排序
 * 同源单点（1.23 用户裁决）：baseBranch = sortBaseBranchOptions(...) 排序后首项，
 * 删独立 defaultBranch 取值分叉；空清单退 main 占位。defaultBranch 仍作为排序身份位
 * 消费（1.13 存在性校验链不废）。 */
export function initialCreateForm(
  defaultBranch: string | undefined,
  branches: readonly string[],
  currentBranch?: string | null | undefined,
): CreateWorktreeFormValue {
  const baseBranch = sortBaseBranchOptions(branches, defaultBranch, currentBranch)[0] ?? 'main'
  return {
    baseBranch,
    branch: '',
    worktreeName: '',
    worktreeTouched: false,
    customPathOpen: false,
    customPath: '',
    baseOpen: false,
    branchOpen: false,
  }
}

/**
 * 派生规约（纯函数，1.20 用户裁决：同名默认）：worktree 名未手改前与分支名同名跟随；
 * 手改后脱离跟随以用户值为准（判定单源 isWorktreeNameFollowing——回同名值即恢复跟随）。
 */
export function deriveFormWorktreeName(form: CreateWorktreeFormValue): string {
  return isWorktreeNameFollowing(form.branch, form.worktreeName, form.worktreeTouched) ? form.branch : form.worktreeName
}

/** 路径预览（自定义路径开且非空 = 自定义值；否则 = 所配目录/派生名——joinWorktreePath 归一反斜杠口径） */
export function createFormPathPreview(form: CreateWorktreeFormValue, worktreeDir: string): string {
  return form.customPathOpen && form.customPath !== '' ? form.customPath : joinWorktreePath(worktreeDir, form.worktreeName)
}

export interface CreateWorktreeFieldsProps {
  readonly value: CreateWorktreeFormValue
  /** 分支清单（基准分支下拉数据源 + 分支同名冲突源——git for-each-ref refs/heads） */
  readonly branches: readonly string[]
  /** slug 候选（分支下拉——提案/feature slug，未完成排前去重后由挂载面给定） */
  readonly slugCandidates?: readonly SlugCandidate[]
  /** 同名冲突集（弹窗层算定传入——Fields 只呈现告警） */
  readonly conflicts?: readonly CreateConflict[]
  /** 所配 worktree 目录（路径预览行——未自定义时「将创建于 …」） */
  readonly worktreeDir: string
  /** 默认分支（branches RPC defaultBranch——1.13 校验链；基准分支下拉排序身份位） */
  readonly defaultBranch?: string | undefined
  /** 主树当前检出分支（主行 isMain——基准分支下拉排序身份位；缺省 = 不参与位序表） */
  readonly currentBranch?: string | null | undefined
  readonly onChange: (value: CreateWorktreeFormValue) => void
  /**
   * 分支组合框插槽（可选——合并形态：单一可输入过滤组合框替代 Input+分离下拉）。
   * apps/web 注入通用 EditableCombobox（包零 dsh-forge 依赖不直 import——slot 反转）；
   * 缺省 = 既有分离实现（Input + 下拉触发器，data-dswt-branch-* 锚保留）。
   */
  readonly BranchCombobox?: BranchComboboxSlot
}

/** 分支组合框插槽行（label ReactNode——消费方样式自持；id = 回填值） */
export interface BranchComboboxSlotOption {
  readonly id: string
  readonly label: ReactNode
}

/** 分支组合框插槽契约（EditableCombobox 结构同形子集——组件可直插） */
export interface BranchComboboxSlotProps {
  readonly value: string
  readonly onChange: (value: string) => void
  /** 全量候选（未完成排前/去重后；过滤经 onFilter 注入） */
  readonly options: readonly BranchComboboxSlotOption[]
  /** 输入过滤回调（当前输入值 → 过滤后候选） */
  readonly onFilter?: (query: string) => readonly BranchComboboxSlotOption[]
  readonly placeholder?: string
}

export type BranchComboboxSlot = (props: BranchComboboxSlotProps) => ReactNode

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
/** 冲突告警行（表单内——进 git 前拦截的提示通道） */
const conflictStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 6,
  fontSize: 12,
  color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-state-business-primary))',
}

/** 同名冲突告警行（data-dswt-conflict-* 走查锚） */
function ConflictWarning({ kind, name }: { kind: 'branch' | 'worktree'; name: string }): ReactNode {
  return (
    <div {...{ [`data-dswt-conflict-${kind}`]: '' } as React.HTMLAttributes<HTMLDivElement>} style={conflictStyle}>
      <IconWarningTriangleOutlineRegular size={14} />
      <span>{kind === 'branch' ? `分支 ${name} 已存在` : `worktree ${name} 已存在`}</span>
    </div>
  )
}

/** 三字段表单体（官方 Input/Menu 形态——弹窗 body 内容，Modal 外提单测面） */
export function CreateWorktreeFields({
  value: form,
  branches,
  slugCandidates = [],
  conflicts = [],
  worktreeDir,
  defaultBranch,
  currentBranch,
  onChange,
  BranchCombobox,
}: CreateWorktreeFieldsProps): ReactNode {
  // 1.22 用户裁决：基准分支选项排序 main > master > default > current > 其余（字母序兜底）
  const baseItems = useMemo(
    () => sortBaseBranchOptions(branches, defaultBranch, currentBranch).map((id) => ({ id, label: id })),
    [branches, defaultBranch, currentBranch],
  )
  const worktreeName = deriveFormWorktreeName(form)
  const previewPath = createFormPathPreview({ ...form, worktreeName }, worktreeDir)
  // 目录/尾段两分（官方 PathLabel pathPartsOf 同语义——最后一个分隔符处切）：目录段
  // label-tertiary、尾段 label-primary = 官方 PathLabel 同规格色阶（可见段全程标准对比）
  const lastSep = Math.max(previewPath.lastIndexOf('\\'), previewPath.lastIndexOf('/'))
  const pathDirectory = lastSep === -1 ? '' : previewPath.slice(0, lastSep + 1)
  const pathName = lastSep === -1 ? previewPath : previewPath.slice(lastSep + 1)
  // 分支变化（手写/候选回填/组合框）：跟随态（含用户值清回同名）下复位手改标记——
  // worktree 名继续同名跟随；已脱离跟随则保留用户值（判定单源 isWorktreeNameFollowing）
  const changeBranch = (branch: string): void => {
    const following = isWorktreeNameFollowing(form.branch, form.worktreeName, form.worktreeTouched)
    onChange({ ...form, branch, worktreeTouched: following ? false : form.worktreeTouched })
  }
  const slugItems = useMemo(
    () =>
      slugCandidates.map((candidate) => ({
        id: candidate.slug,
        label: (
          <span style={{ ...mono, fontSize: 13 }}>
            {candidate.slug}
            {candidate.done ? <span style={{ ...fieldOpt }}>　已完成</span> : null}
          </span>
        ),
      })),
    [slugCandidates],
  )
  // 分支候选过滤（大小写不敏感子串；空输入 = 全量）——分离实现与组合框插槽共用
  const filterItems = useMemo(
    () => (query: string) =>
      filterSlugCandidates(slugCandidates, query).map(
        (candidate) => slugItems.find((item) => item.id === candidate.slug) ?? { id: candidate.slug, label: candidate.slug },
      ),
    [slugCandidates, slugItems],
  )
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
                // 盒模型（width/height/padding/border/radius/background）= .dswt-field-control
                // 共享规则（session.css 1.15 段——等宽基准单一来源，与组合框输入壳同源）
                className="dswt-field-control"
                style={{
                  gap: 8,
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
        {BranchCombobox !== undefined ? (
          // 合并形态：单一可输入过滤组合框（↑↓ 选择 / Enter 回填 / Esc·失焦·外点关闭）
          <div style={fieldStretch}>
            <BranchCombobox
              value={form.branch}
              onChange={changeBranch}
              options={slugItems}
              onFilter={filterItems}
              placeholder="feat/my-branch"
            />
          </div>
        ) : (
          // 分离实现（缺省保留）：输入行 = Input（手写）+ 触发器（候选清单）——官方 Menu 锚定
          <div style={fieldStretch}>
            <Menu
              open={form.branchOpen}
              anchor={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      data-dswt-branch-input=""
                      value={form.branch}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        changeBranch(event.currentTarget.value)
                      }}
                      style={inputStyle}
                      placeholder="feat/my-branch"
                    />
                  </div>
                  <button
                    type="button"
                    data-dswt-branch-trigger=""
                    aria-label="slug 候选"
                    onClick={() => {
                      onChange({ ...form, branchOpen: !form.branchOpen })
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      border: '0.5px solid var(--dsw-alias-border-l2)',
                      borderRadius: 8,
                      background: 'var(--dsw-alias-bg-layer-1)',
                      color: 'var(--dsw-alias-label-tertiary)',
                      cursor: 'pointer',
                    }}
                  >
                    <IconChevronDownOutlineRegular size={14} />
                  </button>
                </div>
              }
              items={filterItems(form.branch)}
              onSelect={(id) => {
                changeBranch(id)
                onChange({ ...form, branchOpen: false })
              }}
              onClose={() => {
                onChange({ ...form, branchOpen: false })
              }}
              listClassName="dswt-branch-slug-menu"
            />
          </div>
        )}
        {conflicts.includes('branch-exists') && <ConflictWarning kind="branch" name={form.branch.trim()} />}
      </div>

      <div data-dswt-field-worktree="">
        <div style={fieldLabel}>
          worktree <span style={fieldOpt}>（默认与分支同名，可改）</span>
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
        {/* 路径呈现对齐官方 PathLabel 规格：目录段弱化/尾段主色、单行 overflow 裁剪、
            flex-end 保尾段（文件名）可见——无左缘 mask 渐隐段（1.21 可见段全对比）；
            悬浮全文 = 官方 Tooltip（portal 逃逸弹窗裁剪/层叠，形态/令牌/时序与系统一致；
            PathLabel 内建原生 title 灰盒随本面退役——1.21 用户裁决）。
            「将创建于」与入口锚 flexShrink:0，路径标签吃剩余宽（官方路径风格） */}
        <div
          data-dswt-path-preview=""
          style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 12, marginTop: 6, whiteSpace: 'nowrap' }}
        >
          <span style={{ flexShrink: 0 }}>将创建于</span>
          <Tooltip label={previewPath} portal side="top">
            <span
              data-dswt-path-value=""
              style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', flex: '0 1 auto' }}
            >
              <span style={{ flex: 'none', marginRight: 'auto' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{pathDirectory}</span>
                <span style={{ color: 'var(--dsw-alias-label-primary)' }}>{pathName}</span>
              </span>
            </span>
          </Tooltip>
          {form.customPathOpen ? null : (
            <a
              href="#custom-path"
              data-dswt-custom-path=""
              onClick={(event) => {
                event.preventDefault()
                onChange({ ...form, customPathOpen: true })
              }}
              style={{ flexShrink: 0, color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer' }}
            >
              自定义路径…
            </a>
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
        {conflicts.includes('worktree-exists') && <ConflictWarning kind="worktree" name={worktreeName.trim()} />}
      </div>
    </>
  )
}

export interface CreateWorktreeDialogProps {
  readonly open: boolean
  readonly branches: readonly string[]
  /** 既有 worktree 名（同名冲突源——list RPC 行名集；缺省 = 不判 worktree 冲突） */
  readonly existingWorktreeNames?: readonly string[]
  /** slug 候选（分支下拉——提案/feature slug，未完成排前去重；缺省 = 无候选） */
  readonly slugCandidates?: readonly SlugCandidate[]
  /** 基准分支默认值（主 worktree 判定/origin 默认分支——装配层给） */
  readonly defaultBranch?: string | undefined
  /** 主树当前检出分支（1.19 风险确认判定基准——装配层从清单主行给；缺省 = 保守判风险） */
  readonly mainBranch?: string | null | undefined
  /** 所配 worktree 目录（路径预览行——未自定义时「将创建于 …」） */
  readonly worktreeDir: string
  readonly onClose: () => void
  readonly onCreate: (request: CreateWorktreeRequest) => void
  /** 分支组合框插槽（合并形态注入——Fields 同名 prop 透传；缺省 = 既有分离实现） */
  readonly BranchCombobox?: BranchComboboxSlot
}

/**
 * 新建 worktree 弹窗（官方 Modal；contentClassName = .dswt-create-dialog 走查锚）。
 * 「创建」钮门 = isCreateReady（分支名 + worktree 名齐备）∧ 零同名冲突（进 git 前拦截）。
 */
export function CreateWorktreeDialog({
  open,
  branches,
  existingWorktreeNames = [],
  slugCandidates = [],
  defaultBranch,
  mainBranch = null,
  worktreeDir,
  onClose,
  onCreate,
  BranchCombobox,
}: CreateWorktreeDialogProps): ReactNode {
  const [form, setForm] = useState<CreateWorktreeFormValue>(() => initialCreateForm(defaultBranch, branches, mainBranch))
  // 1.19 基准分支跨分支风险确认（确认才进 git，取消不创建）
  const [riskOpen, setRiskOpen] = useState(false)
  // 打开即重置（默认值取当下快照）；defaults 异步到达（branches RPC 晚于 open）不清空用户输入——
  // 重置与默认值更新分两个 effect：后者仅在用户未输入时回填基准分支（1.19 e2e 实证输入中竞态）
  useEffect(() => {
    if (open) setForm(initialCreateForm(defaultBranch, branches, mainBranch))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 重置只在 open 跳变沿；defaults 到达走下方守卫 effect
  }, [open])
  useEffect(() => {
    if (!open) return
    setForm((prev) => {
      if (prev.branch !== '' || prev.worktreeTouched) return prev // 用户已输入——不清空
      const fresh = initialCreateForm(defaultBranch, branches, mainBranch)
      return prev.baseBranch === fresh.baseBranch ? prev : { ...prev, baseBranch: fresh.baseBranch }
    })
  }, [open, defaultBranch, branches, mainBranch])
  const worktreeName = deriveFormWorktreeName(form)
  const conflicts = useMemo(
    () => createConflicts(form.branch, worktreeName, branches, existingWorktreeNames),
    [form.branch, worktreeName, branches, existingWorktreeNames],
  )
  const ready = isCreateReady(form.branch, worktreeName) && conflicts.length === 0
  const proceed = () => {
    onCreate({
      baseBranch: form.baseBranch,
      branch: form.branch.trim(),
      worktreeName: worktreeName.trim(),
      customPath: form.customPathOpen && form.customPath.trim() !== '' ? form.customPath.trim() : undefined,
    })
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建 worktree"
      closeLabel="关闭"
      // 卡面放宽一档（官方 .dialog min(380px,100%) → .dswt-create-modal min(432px,100%)，
      // 挂载面 session.css）——容纳路径说明行，三输入等宽基准同步放宽
      className="dswt-create-modal"
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
              if (isCrossBranchRisk(form.baseBranch, mainBranch)) {
                setRiskOpen(true)
                return
              }
              proceed()
            }}
          >
            创建
          </Button>
        </>
      }
    >
      <CreateWorktreeFields
        value={form}
        branches={branches}
        slugCandidates={slugCandidates}
        conflicts={conflicts}
        worktreeDir={worktreeDir}
        defaultBranch={defaultBranch}
        currentBranch={mainBranch}
        onChange={setForm}
        BranchCombobox={BranchCombobox}
      />
      <WorktreeRiskConfirmation
        open={riskOpen}
        targetBranch={form.baseBranch}
        currentBranch={mainBranch}
        title="基准分支跨分支确认"
        onCancel={() => {
          setRiskOpen(false) // 取消：不创建（零 git 写）
        }}
        onConfirm={() => {
          setRiskOpen(false)
          proceed()
        }}
      />
    </Modal>
  )
}
