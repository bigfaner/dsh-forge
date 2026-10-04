// UF-3 段二·注册表单（定位：业务——表单采集与校验；提交执行链（确认 → registerProject →
// 反馈）属 2.10 组装，本件只产 RegisterProjectInput 回调，不接 RPC）。
// 数据进（values/issues/派生行）回调出（edit/repick/browse/submit）的纯渲染面
// RegisterFormView + 持表单状态（值 + touched 手改标记 + 浏览改选相位）的装配壳
// RegisterForm。「浏览…」/「重新选择」改选：桥缺席 = 内嵌 2.8 DirectoryBrowser 复用
// （startDir = 当前值 + confirmLabel =「选择此文件夹」参数化——BrowsePanel 槽位承载）；
// fix-14 桥在场 = 三 target 同桥直选系统 OS 目录对话框（nativeBrowseAction——BrowsePanel
// 回退面不变）。工作区行已注册提示 = pick 时浏览器「已注册」标记的表单相位口径迁移
// （走查裁决：系统对话框无法行级标记 → 挂接语义在表单呈现；回退浏览器标记保留）。
// 联动语义（换选工作区：未手改重构 / 手改·浏览选定保留）与派生（扁平化任务清单 / 仓内外）
// 在 form-model 纯函数，浏览相位/落值转移在 form-actions（setState 注入面——单测覆盖）；
// Hard Rules：仅采集与校验，零注册调用零补偿。
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { StateChip } from '../../components/index.js'
import type { RegisterProjectInput } from '@dsh-forge/contracts'
import type { BrowserSelection } from './browser-model.js'
import { DirectoryBrowser } from './DirectoryBrowser.js'
import { directoryPickerBridgeOf, type NativePickSource } from './dir-picker.js'
import { rpcDirSource, type DirSource } from './dir-source.js'
import { formActions, nativeBrowseAction } from './form-actions.js'
import {
  DEFAULT_DSH_FORGE_HOME,
  deriveTaskStoreDir,
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

const EMPTY_REGISTERED: ReadonlySet<string> = new Set()

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
  /** 任务清单与记录只读派生行（{dsh-forge-home}/{canonical-path 扁平化}） */
  readonly taskStoreDir: string
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

/** 注册表单纯渲染面（数据进/回调出；仓内外 chip = StateChip，无 radio 控件） */
export function RegisterFormView({
  values,
  issues,
  taskStoreDir,
  forgeDirExternal,
  workspaceRegistered = false,
  browseBusy = false,
  nativePickError = null,
  onEdit,
  onRepick,
  onBrowse,
  onSubmit,
}: RegisterFormViewProps): ReactNode {
  const issueOf = (field: FormField): FormIssue | undefined =>
    issues.find((issue) => issue.field === field)
  const nameIssue = issueOf('name')
  const forgeIssue = issueOf('forgeDir')
  const knowledgeIssue = issueOf('knowledgeDir')
  const editHandler =
    onEdit === undefined
      ? undefined
      : (field: EditableField) => (event: { readonly target: { readonly value: string } }) => {
          onEdit(field, event.target.value)
        }

  return (
    <div className="dswf-rf" data-dswf-rf="form">
      <div className="dswf-rf-row">
        <div className="dswf-rf-labelrow">
          <label className="dswf-rf-label" htmlFor="dswf-rf-ws">
            工作区目录（文件浏览器选定）
          </label>
          {workspaceRegistered ? (
            <StateChip status="已注册" className="dswf-rf-wsreg" />
          ) : null}
        </div>
        <div className="dswf-rf-line">
          <input
            id="dswf-rf-ws"
            className="dswf-rf-input"
            data-dswf-rf-ws
            type="text"
            value={values.workspaceDir}
            readOnly
            title={values.workspaceDir}
          />
          <Button
            variant="ghost"
            size="sm"
            className="dswf-rf-sidebtn"
            title="重开文件浏览器换选工作区（未手改字段随新工作区重构）"
            disabled={browseBusy}
            onClick={onRepick}
          >
            重新选择
          </Button>
        </div>
        {workspaceRegistered ? (
          <p className="dswf-rf-hint" data-dswf-rf-registered>
            该目录已注册——「确认」将幂等返回既有项目（挂接既有工作区，不重复登记）。
          </p>
        ) : null}
      </div>

      <div className="dswf-rf-row">
        <label className="dswf-rf-label" htmlFor="dswf-rf-name">
          项目名（自动取文件夹名，可改）
        </label>
        <input
          id="dswf-rf-name"
          className="dswf-rf-input"
          data-dswf-rf-name
          type="text"
          value={values.name}
          onChange={editHandler?.('name')}
        />
        {nameIssue ? <FieldIssue issue={nameIssue} /> : null}
      </div>

      <div className="dswf-rf-row">
        <div className="dswf-rf-labelrow">
          <label className="dswf-rf-label" htmlFor="dswf-rf-forge">
            文档位置 · forge 目录
          </label>
          {values.forgeDir.trim() !== '' ? (
            <StateChip
              status={forgeDirExternal ? '仓外' : '仓内'}
              className="dswf-rf-relation"
            />
          ) : null}
        </div>
        <div className="dswf-rf-line">
          <input
            id="dswf-rf-forge"
            className="dswf-rf-input"
            data-dswf-rf-forge
            type="text"
            value={values.forgeDir}
            onChange={editHandler?.('forgeDir')}
          />
          <Button
            variant="ghost"
            size="sm"
            className="dswf-rf-sidebtn"
            title="经文件浏览器选择目录"
            disabled={browseBusy}
            onClick={onBrowse === undefined ? undefined : () => { onBrowse('forgeDir') }}
          >
            浏览…
          </Button>
        </div>
        <p className="dswf-rf-hint">默认 = &lt;工作区&gt;\.forge；可直接输入或浏览改选（仓外需授权；应用侧只读引用）</p>
        {forgeIssue ? <FieldIssue issue={forgeIssue} /> : null}
      </div>

      <div className="dswf-rf-row">
        <label className="dswf-rf-label" htmlFor="dswf-rf-kn">
          知识库目录
        </label>
        <div className="dswf-rf-line">
          <input
            id="dswf-rf-kn"
            className="dswf-rf-input"
            data-dswf-rf-kn
            type="text"
            value={values.knowledgeDir}
            onChange={editHandler?.('knowledgeDir')}
          />
          <Button
            variant="ghost"
            size="sm"
            className="dswf-rf-sidebtn"
            title="经文件浏览器选择目录"
            disabled={browseBusy}
            onClick={onBrowse === undefined ? undefined : () => { onBrowse('knowledgeDir') }}
          >
            浏览…
          </Button>
        </div>
        <p className="dswf-rf-hint">默认 = &lt;工作区&gt;\.knowledge；可直接输入或浏览改选仓外目录</p>
        {knowledgeIssue ? <FieldIssue issue={knowledgeIssue} /> : null}
      </div>

      {nativePickError === null ? null : (
        <p className="dswf-rf-issue" role="alert" data-dswf-rf-np-error>
          目录选择失败：{nativePickError}
        </p>
      )}

      <div className="dswf-rf-row">
        <label className="dswf-rf-label" htmlFor="dswf-rf-tasks">
          任务清单与记录（自动派生 · 无需填写）
        </label>
        <input
          id="dswf-rf-tasks"
          className="dswf-rf-input dswf-rf-static"
          data-dswf-rf-tasks
          type="text"
          value={taskStoreDir}
          readOnly
          tabIndex={-1}
          title="统一存放于 {dsh-forge-home}/{canonical-path 扁平化}，注册时自动派生"
        />
      </div>

      <div className="dswf-rf-footer">
        <p className="dswf-rf-footnote">确认后进入注册执行（不可中断；失败自动补偿）</p>
        <Button
          variant="primary"
          size="md"
          className="dswf-rf-confirm"
          disabled={issues.length > 0}
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
  /** 任务清单派生前缀（缺省 = 展示口径 ~/*.dsh-forge；2.10/配置面可注入真实 home） */
  readonly dshForgeHome?: string
  /** 「确认」采集载荷上抛（执行链 registerProject 归 2.10 接线——Hard Rules） */
  readonly onSubmit?: (input: RegisterProjectInput) => void
}

/**
 * 注册表单本体（值 + touched + 浏览相位状态壳）。换选工作区两条路径同径联动：
 * 内「重新选择」（浏览面板/原生直选确认）与外部 selection.path 变更（2.10 返回上一步
 * 重选）均走 relinkWorkspace——未手改字段随新工作区重构、手改或浏览选定过的保留（AC4）。
 * fix-14：桥在场 = 三改选 target 直选系统 OS 目录对话框（nativeBrowseAction——BrowsePanel
 * 不出场）；桥缺席 = BrowsePanel 内嵌浏览器回退面（形态零变化）。
 */
export function RegisterForm({
  selection,
  source,
  registeredPaths = EMPTY_REGISTERED,
  nativePicker,
  dshForgeHome = DEFAULT_DSH_FORGE_HOME,
  onSubmit,
}: RegisterFormProps): ReactNode {
  const [form, setForm] = useState<FormState>(() => initialFormState(selection))
  const [browsing, setBrowsing] = useState<BrowseTarget | null>(null)
  const [nativeBusy, setNativeBusy] = useState(false)
  const [nativeError, setNativeError] = useState<string | null>(null)

  // 转移逻辑 = form-actions 注入 setState 面（联动/浏览相位语义见该模块单测）
  const actions = useMemo(() => formActions({ setForm, setBrowsing }), [])
  const effectiveSource = useMemo<DirSource>(() => source ?? rpcDirSource(), [source])
  // 原生选取源解析：注入桩 > 桥探测（undefined = 探测；null = 强制回退 BrowsePanel）
  const effectiveNativePick = useMemo<NativePickSource | null>(() => {
    if (nativePicker !== undefined) return nativePicker
    const bridge = directoryPickerBridgeOf()
    return bridge === undefined ? null : () => bridge.pick()
  }, [nativePicker])
  const nativeBrowse = useMemo(
    () =>
      effectiveNativePick === null
        ? null
        : nativeBrowseAction({
            pick: effectiveNativePick,
            dirSource: effectiveSource,
            applyPick: actions.applyPick,
            onBusy: setNativeBusy,
            onError: setNativeError,
          }),
    [effectiveNativePick, effectiveSource, actions],
  )

  // 外部换选（2.10 返回上一步重选工作区）：路径变更才落位（mount 同径 = no-op）
  useEffect(() => {
    actions.relinkExternal(selection.path)
  }, [actions, selection.path])

  const issues = validateFormValues(form.values)

  if (nativeBrowse !== null) {
    return (
      <RegisterFormView
        values={form.values}
        issues={issues}
        taskStoreDir={deriveTaskStoreDir(dshForgeHome, form.values.workspaceDir)}
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
          onConfirm={(picked) => { actions.applyPick(browsing, picked.path) }}
        />
      </BrowsePanel>
    )
  }

  return (
    <RegisterFormView
      values={form.values}
      issues={issues}
      taskStoreDir={deriveTaskStoreDir(dshForgeHome, form.values.workspaceDir)}
      forgeDirExternal={isForgeDirExternal(form.values.workspaceDir, form.values.forgeDir)}
      workspaceRegistered={registeredPaths.has(form.values.workspaceDir)}
      onEdit={actions.edit}
      onRepick={actions.repick}
      onBrowse={actions.browse}
      onSubmit={issues.length > 0 ? undefined : () => { onSubmit?.(toRegisterInput(form.values)) }}
    />
  )
}
