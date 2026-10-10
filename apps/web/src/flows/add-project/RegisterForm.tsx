// UF-3 段二·注册表单（定位：业务——表单采集与校验；提交执行链（确认 → registerProject →
// 反馈）属 2.10 组装，本件只产 RegisterProjectInput 回调，不接注册 RPC）。
// 数据进（values/issues/派生行相位）回调出（edit/repick/browse/submit）的纯渲染面
// RegisterFormView + 持表单状态（值 + touched 手改标记 + 浏览改选相位）的装配壳
// RegisterForm。「浏览…」/「重新选择」改选：桥缺席 = 内嵌 2.8 DirectoryBrowser 复用
// （startDir = 当前值 + confirmLabel =「选择此文件夹」参数化——BrowsePanel 槽位承载）；
// fix-14 桥在场 = 三 target 同桥直选系统 OS 目录对话框（nativeBrowseAction——BrowsePanel
// 回退面不变）。工作区行已注册提示 = pick 时浏览器「已注册」标记的表单相位口径迁移
// （走查裁决：系统对话框无法行级标记 → 挂接语义在表单呈现；回退浏览器标记保留）。
// 联动语义（换选工作区：未手改重构 / 手改·浏览选定保留）与仓内外推导在 form-model
// 纯函数，浏览相位/落值转移在 form-actions（setState 注入面——单测覆盖）；
// 4.3 Integration #1：任务清单派生行整行替换为 3.11 DerivedTaskStoreRow——值 =
// forge:projects/deriveTaskStoreDir RPC 单源下发（derive-source；form-model 前端自算
// 废除——Hard Rule 派生行单源 = core deriveTaskStoreDir，禁自算回退），目录选定即预检
// （表单预检位纯读）；疑似移动（ERR_SUSPECTED_MOVE）→ 错误条 + 手工指引留场 + 确认
// 禁用（拒绝零副作用），重选目录复检通过即恢复；Hard Rules：仅采集与校验，零注册调用零补偿。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { StateChip } from '../../components/index.js'
import type { RegisterProjectInput } from '@dsh-forge/contracts'
import type { BrowserSelection } from './browser-model.js'
import { DerivedTaskStoreRow, type DerivedTaskStorePhase } from './derived-store-row.js'
import { DirectoryBrowser } from './DirectoryBrowser.js'
import { EMPTY_REGISTERED, resolveNativePickSource, type NativePickSource } from './dir-picker.js'
import { rpcDirSource, type DirSource } from './dir-source.js'
import { fetchDerivePhase, rpcDeriveSource, type DeriveSource } from './derive-source.js'
import { formActions, nativeBrowseAction } from './form-actions.js'
import {
  initialFormState,
  isForgeDirExternal,
  toRegisterInput,
  validateFormValues,
  type BrowseTarget,
  type EditableField,
  type FormField,
  type FormIssue,
  type FormState,
  type FormValues,
} from './form-model.js'
import './form.css'

export type { BrowseTarget }

/** 浏览面板标题（目标参数化） */
export const BROWSE_TITLES: Readonly<Record<BrowseTarget, string>> = {
  workspace: '选择工作区目录',
  forgeDir: '选择 forge 目录（文档位置）',
  knowledgeDir: '选择知识库目录',
}

/** 浏览面板底部提示（DirectoryBrowser hint 参数化） */
const BROWSE_HINTS: Readonly<Record<BrowseTarget, string>> = {
  workspace: '单击选中，双击进入；选定后回填工作区目录，未手改字段随新工作区重构。',
  forgeDir: '单击选中，双击进入；选定后回填「文档位置 · forge 目录」（不再随工作区自动重构）。',
  knowledgeDir: '单击选中，双击进入；选定后回填「知识库目录」（不再随工作区自动重构）。',
}

/** RegisterFormView props（纯渲染面——静态标记可测；2.10 模态壳内嵌本体） */
export interface RegisterFormViewProps {
  /** 表单值（workspaceDir 只读回填；三可编辑字段直输改） */
  readonly values: FormValues
  /** 校验问题（随值即时重算——AC5 表单态拦截呈现） */
  readonly issues: readonly FormIssue[]
  /** 任务清单与记录只读派生行相位（4.3：RPC 单源下发——loading/ready/suspected-move/error） */
  readonly taskStorePhase: DerivedTaskStorePhase
  /** 仓内/仓外推导结果（true = 仓外；随 forge 目录即时更新） */
  readonly forgeDirExternal: boolean
  /** 工作区目录已注册（fix-14 表单相位挂接提示——pick 时浏览器标记的口径迁移） */
  readonly workspaceRegistered?: boolean
  /** 原生改选在途（系统对话框打开中——三改选钮禁用防双开） */
  readonly browseBusy?: boolean
  /** 原生改选失败文案（错误面呈现；null = 无） */
  readonly nativePickError?: string | null
  /** 直输改字段（值更新 + touched 置位） */
  readonly onEdit?: (field: EditableField, value: string) => void
  /** 「重新选择」重开浏览器换工作区（联动 = relinkWorkspace） */
  readonly onRepick?: () => void
  /** 「浏览…」改选两目录（目标参数化） */
  readonly onBrowse?: (target: BrowseTarget) => void
  /** 「确认」（合法才可达——采集载荷经 onSubmit 上抛，执行链归 2.10） */
  readonly onSubmit?: () => void
}

/** 字段错误行（AC5：role=alert + 归属锚） */
function FieldIssue({ issue }: { issue: FormIssue }): ReactNode {
  return (
    <p className="dswf-rf-issue" role="alert" data-dswf-rf-issue={issue.field}>
      {issue.message}
    </p>
  )
}

/**
 * 表单行件（fix-36 抽出——RegisterFormView 行骨架的单一来源）：labelRow 在场 = label
 * 包 `.dswf-rf-labelrow`（chip 挂行尾）；side 在场 = input + 钮包 `.dswf-rf-line`；
 * hint/issue 条件尾随。形态组合：工作区 = labelRow+side+hint / 项目名 = 裸行+issue /
 * forge = labelRow+side+hint+issue / 知识库 = 裸 label+side+hint+issue（任务清单行 =
 * 3.11 DerivedTaskStoreRow 独立件，4.3 起不经 FormRow）。
 */
export interface FormRowProps {
  /** label 的 htmlFor（= input id） */
  readonly id: string
  /** 字段标签文案 */
  readonly label: ReactNode
  /** label 行容器（chip 挂 label 行尾的面——ws/forge 行） */
  readonly labelRow?: boolean
  /** label 行尾 chip（已注册/仓内外——条件构造归调用方） */
  readonly chip?: ReactNode
  /** 输入控件本体（调用方构造——id/data 锚/只读态等面自持） */
  readonly input: ReactNode
  /** 行内钮（重新选择/浏览…——在场即包 `.dswf-rf-line`） */
  readonly side?: ReactNode
  /** 行尾提示（默认值说明等） */
  readonly hint?: ReactNode
  /** 字段错误行（校验问题——条件构造归调用方） */
  readonly issue?: ReactNode
}

/** 表单行骨架（结构件——零校验零联动语义） */
export function FormRow({ id, label, labelRow, chip, input, side, hint, issue }: FormRowProps): ReactNode {
  const labelEl = (
    <label className="dswf-rf-label" htmlFor={id}>
      {label}
    </label>
  )
  return (
    <div className="dswf-rf-row">
      {labelRow ? <div className="dswf-rf-labelrow">{labelEl}{chip}</div> : labelEl}
      {side === undefined ? (
        input
      ) : (
        <div className="dswf-rf-line">
          {input}
          {side}
        </div>
      )}
      {hint}
      {issue}
    </div>
  )
}

/** 注册表单纯渲染面（数据进/回调出；仓内外 chip = StateChip，无 radio 控件；行骨架 = FormRow，fix-36 <100 行） */
export function RegisterFormView({
  values,
  issues,
  taskStorePhase,
  forgeDirExternal,
  workspaceRegistered = false,
  browseBusy = false,
  nativePickError = null,
  onEdit,
  onRepick,
  onBrowse,
  onSubmit,
}: RegisterFormViewProps): ReactNode {
  const issueOf = (field: FormField): FormIssue | undefined => issues.find((issue) => issue.field === field)
  const nameIssue = issueOf('name')
  const forgeIssue = issueOf('forgeDir')
  const knowledgeIssue = issueOf('knowledgeDir')
  const editHandler =
    onEdit === undefined
      ? undefined
      : (field: EditableField) => (event: { readonly target: { readonly value: string } }) => {
          onEdit(field, event.target.value)
        }
  const browseBtn = (target: Exclude<BrowseTarget, 'workspace'>): ReactNode => (
    // D30：原生 title 退役——官方 Tooltip（禁用态锚定 = dswf-tipwrap 包裹 span）
    <Tooltip label="经文件浏览器选择目录" portal>
      <span className="dswf-tipwrap">
        <Button
          variant="ghost"
          size="sm"
          className="dswf-rf-sidebtn"
          disabled={browseBusy}
          onClick={onBrowse === undefined ? undefined : () => { onBrowse(target) }}
        >
          浏览…
        </Button>
      </span>
    </Tooltip>
  )
  return (
    <div className="dswf-rf" data-dswf-rf="form">
      <FormRow
        id="dswf-rf-ws"
        label="工作区目录（文件浏览器选定）"
        labelRow
        chip={workspaceRegistered ? <StateChip status="已注册" className="dswf-rf-wsreg" /> : undefined}
        input={
          <Tooltip label={values.workspaceDir} portal>
            <input id="dswf-rf-ws" className="dswf-rf-input" data-dswf-rf-ws type="text" value={values.workspaceDir} readOnly />
          </Tooltip>
        }
        side={
          <Tooltip label="重开文件浏览器换选工作区（未手改字段随新工作区重构）" portal>
            <span className="dswf-tipwrap">
              <Button variant="ghost" size="sm" className="dswf-rf-sidebtn" disabled={browseBusy} onClick={onRepick}>重新选择</Button>
            </span>
          </Tooltip>
        }
        hint={workspaceRegistered ? (
          <p className="dswf-rf-hint" data-dswf-rf-registered>该目录已注册——「确认」将幂等返回既有项目（挂接既有工作区，不重复登记）。</p>
        ) : undefined}
      />
      <FormRow
        id="dswf-rf-name"
        label="项目名（自动取文件夹名，可改）"
        input={<input id="dswf-rf-name" className="dswf-rf-input" data-dswf-rf-name type="text" value={values.name} onChange={editHandler?.('name')} />}
        issue={nameIssue ? <FieldIssue issue={nameIssue} /> : undefined}
      />
      <FormRow
        id="dswf-rf-forge"
        label="文档位置 · forge 目录"
        labelRow
        chip={values.forgeDir.trim() !== '' ? (
          <StateChip status={forgeDirExternal ? '仓外' : '仓内'} className="dswf-rf-relation" />
        ) : undefined}
        input={<input id="dswf-rf-forge" className="dswf-rf-input" data-dswf-rf-forge type="text" value={values.forgeDir} onChange={editHandler?.('forgeDir')} />}
        side={browseBtn('forgeDir')}
        hint={<p className="dswf-rf-hint">默认 = &lt;工作区&gt;\.forge；可直接输入或浏览改选（仓外需授权；应用侧只读引用）；目录不存在时将自动创建</p>}
        issue={forgeIssue ? <FieldIssue issue={forgeIssue} /> : undefined}
      />
      <FormRow
        id="dswf-rf-kn"
        label="知识库目录"
        input={<input id="dswf-rf-kn" className="dswf-rf-input" data-dswf-rf-kn type="text" value={values.knowledgeDir} onChange={editHandler?.('knowledgeDir')} />}
        side={browseBtn('knowledgeDir')}
        hint={<p className="dswf-rf-hint">默认 = &lt;工作区&gt;\.knowledge；可直接输入或浏览改选仓外目录；目录不存在时将自动创建</p>}
        issue={knowledgeIssue ? <FieldIssue issue={knowledgeIssue} /> : undefined}
      />
      {nativePickError === null ? null : (
        <p className="dswf-rf-issue" role="alert" data-dswf-rf-np-error>
          目录选择失败：{nativePickError}
        </p>
      )}
      {/* 4.3 Integration #1：现派生行整行替换——RPC 单源下发（Hard Rule：前端禁自算回退） */}
      <DerivedTaskStoreRow phase={taskStorePhase} />
      <div className="dswf-rf-footer">
        <p className="dswf-rf-footnote">确认后进入注册执行（不可中断；失败自动补偿）</p>
        <Button
          variant="primary"
          size="md"
          className="dswf-rf-confirm"
          disabled={issues.length > 0 || taskStorePhase.state === 'suspected-move'}
          onClick={onSubmit}
        >
          确认
        </Button>
      </div>
    </div>
  )
}

/** BrowsePanel props（浏览改选相位面板——浏览器经 children 注入，装配壳负责参数化） */
export interface BrowsePanelProps {
  /** 改选目标（标题/提示参数化依据） */
  readonly target: BrowseTarget
  /** 返回表单（不改值——取消点在 dsh create 之前，零副作用） */
  readonly onBack?: () => void
  /** DirectoryBrowser 装配（startDir/confirmLabel 等由装配壳注入） */
  readonly children: ReactNode
}

/** 浏览改选面板（表单相位 ⇄ 浏览相位的容器；2.10 模态壳内同体） */
export function BrowsePanel({ target, onBack, children }: BrowsePanelProps): ReactNode {
  return (
    <div className="dswf-rf-browsepanel" data-dswf-rf="browsing" data-dswf-rf-target={target}>
      <div className="dswf-rf-browsebar">
        <span className="dswf-rf-browsetitle">{BROWSE_TITLES[target]}</span>
        <Button variant="ghost" size="sm" onClick={onBack}>
          返回表单
        </Button>
      </div>
      {children}
    </div>
  )
}

/** RegisterForm 装配壳 props */
export interface RegisterFormProps {
  /** 段一产出（工作区选定——表单回填基准；路径外部变更触发联动 relink） */
  readonly selection: BrowserSelection
  /** 浏览改选数据源（缺省 = RPC 真身 forge:fs/listDir；注入 = 测试/桩面） */
  readonly source?: DirSource
  /** 已注册路径集合（重新选择工作区时的行级标记 + 表单相位挂接提示；缺省 = 空集） */
  readonly registeredPaths?: ReadonlySet<string>
  /** 原生选取源（fix-14：缺省 = globalThis.__DSH_DIRECTORY_PICKER__ 桥探测；注入 = 测试桩；
   * null 注入 = 强制 BrowsePanel 回退面） */
  readonly nativePicker?: NativePickSource | null
  /** 派生数据源（4.3：缺省 = RPC 真身 forge:projects/deriveTaskStoreDir；注入 = 测试桩） */
  readonly deriveSource?: DeriveSource
  /** 「确认」采集载荷上抛（执行链 registerProject 归 2.10 接线——Hard Rules） */
  readonly onSubmit?: (input: RegisterProjectInput) => void
}

/**
 * 注册表单本体（值 + touched + 浏览相位 + 派生行相位状态壳）。换选工作区两条路径同径
 * 联动：内「重新选择」（浏览面板/原生直选确认）与外部 selection.path 变更（2.10 返回
 * 上一步重选）均走 relinkWorkspace——未手改字段随新工作区重构、手改或浏览选定过的
 * 保留（AC4）。fix-14：桥在场 = 三改选 target 直选系统 OS 目录对话框
 * （nativeBrowseAction——BrowsePanel 不出场）；桥缺席 = BrowsePanel 内嵌浏览器回退面
 * （形态零变化）。4.3：派生行相位 = derive-source fetchDerivePhase（目录选定即预检，
 * workspaceDir 驱动；换选复检通过即恢复 ready 确认态——序号守卫防快速换选串台）。
 */
export function RegisterForm({
  selection,
  source,
  registeredPaths = EMPTY_REGISTERED,
  nativePicker,
  deriveSource,
  onSubmit,
}: RegisterFormProps): ReactNode {
  const [form, setForm] = useState<FormState>(() => initialFormState(selection))
  const [browsing, setBrowsing] = useState<BrowseTarget | null>(null)
  const [nativeBusy, setNativeBusy] = useState(false)
  const [nativeError, setNativeError] = useState<string | null>(null)
  const [taskStorePhase, setTaskStorePhase] = useState<DerivedTaskStorePhase>({ state: 'loading' })
  const deriveSeqRef = useRef(0)
  // 派生复检 nonce（AC3）：工作区改选（applyPick workspace）即递增——同路径重选（手工
  // 处置孤儿目录后的指引重试径）也触发复检；值变更面由 workspaceDir 依赖覆盖。
  const [deriveNonce, setDeriveNonce] = useState(0)

  // 转移逻辑 = form-actions 注入 setState 面（联动/浏览相位语义见该模块单测）
  const actions = useMemo(() => formActions({ setForm, setBrowsing }), [])
  const effectiveSource = useMemo<DirSource>(() => source ?? rpcDirSource(), [source])
  // 原生选取源解析（dir-picker 共享纯函数——AddProjectFlow 同判据，fix-36 收敛）
  const effectiveNativePick = useMemo<NativePickSource | null>(
    () => resolveNativePickSource(nativePicker),
    [nativePicker],
  )
  // 工作区落值包一层复检递增（BrowsePanel 确认/原生直选同径——applyPick 唯一落值口保持）
  const applyPickWithRecheck = useCallback((target: BrowseTarget, dirPath: string) => {
    if (target === 'workspace') setDeriveNonce((n) => n + 1)
    actions.applyPick(target, dirPath)
  }, [actions])
  const nativeBrowse = useMemo(
    () =>
      effectiveNativePick === null
        ? null
        : nativeBrowseAction({
            pick: effectiveNativePick,
            dirSource: effectiveSource,
            applyPick: applyPickWithRecheck,
            onBusy: setNativeBusy,
            onError: setNativeError,
          }),
    [effectiveNativePick, effectiveSource, applyPickWithRecheck],
  )

  // 外部换选（2.10 返回上一步重选工作区）：路径变更才落位（mount 同径 = no-op）
  useEffect(() => {
    actions.relinkExternal(selection.path)
  }, [actions, selection.path])

  // 派生行预检（4.3 Integration #1）：目录选定即预检（表单预检位纯读）——workspaceDir
  // 变更/工作区改选 nonce 驱动：在途骨架 → RPC 单源下发（ready / 疑似移动拒绝留场 /
  // error 兜底）；重选目录复检通过即恢复 ready（AC3）。序号守卫（useSessionTaskPills
  // 同形制）：快速换选时旧响应作废，防串台。预检在途/兜底错误不阻断确认——注册闭包
  // 复检恒权威（Interface 5）。
  const effectiveDeriveSource = useMemo<DeriveSource>(() => deriveSource ?? rpcDeriveSource(), [deriveSource])
  useEffect(() => {
    const seq = ++deriveSeqRef.current
    let alive = true
    setTaskStorePhase({ state: 'loading' })
    void fetchDerivePhase(effectiveDeriveSource, form.values.workspaceDir).then((phase) => {
      if (!alive || seq !== deriveSeqRef.current) return
      setTaskStorePhase(phase)
    })
    return () => {
      alive = false
    }
  }, [form.values.workspaceDir, deriveNonce, effectiveDeriveSource])

  const issues = validateFormValues(form.values)

  if (nativeBrowse !== null) {
    return (
      <RegisterFormView
        values={form.values}
        issues={issues}
        taskStorePhase={taskStorePhase}
        forgeDirExternal={isForgeDirExternal(form.values.workspaceDir, form.values.forgeDir)}
        workspaceRegistered={registeredPaths.has(form.values.workspaceDir)}
        browseBusy={nativeBusy}
        nativePickError={nativeError}
        onEdit={actions.edit}
        onRepick={() => { nativeBrowse('workspace') }}
        onBrowse={(target) => { nativeBrowse(target) }}
        onSubmit={issues.length > 0 ? undefined : () => { onSubmit?.(toRegisterInput(form.values)) }}
      />
    )
  }

  if (browsing !== null) {
    const startDir = browsing === 'workspace' ? form.values.workspaceDir : form.values[browsing]
    return (
      <BrowsePanel target={browsing} onBack={actions.cancelBrowse}>
        <DirectoryBrowser
          source={effectiveSource}
          startDir={startDir}
          registeredPaths={browsing === 'workspace' ? registeredPaths : EMPTY_REGISTERED}
          confirmLabel="选择此文件夹"
          hint={BROWSE_HINTS[browsing]}
          onConfirm={(picked) => { applyPickWithRecheck(browsing, picked.path) }}
        />
      </BrowsePanel>
    )
  }

  return (
    <RegisterFormView
      values={form.values}
      issues={issues}
      taskStorePhase={taskStorePhase}
      forgeDirExternal={isForgeDirExternal(form.values.workspaceDir, form.values.forgeDir)}
      workspaceRegistered={registeredPaths.has(form.values.workspaceDir)}
      onEdit={actions.edit}
      onRepick={actions.repick}
      onBrowse={actions.browse}
      onSubmit={issues.length > 0 ? undefined : () => { onSubmit?.(toRegisterInput(form.values)) }}
    />
  )
}
