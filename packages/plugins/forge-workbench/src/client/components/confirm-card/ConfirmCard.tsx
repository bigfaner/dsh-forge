/**
 * The C7 添加项目确认卡, BUILD half (task 1.5; ui-design C7 全节 +
 * workbench-layout-v2 §2.2 ＋ 行 裁决 #24 + decisions §5 v2): a Dialog r24
 * over the shared DialogFrame — 代码区 (the ONLY input; drag/paste/browse,
 * quote-stripping, bare-drive/relative rejected at entry) → 侦测行 (信息陈述,
 * never error codes) → 项目名 (auto folder name, ✎ 可改) → 文档位置预览行
 * (证据三档预选, ✎ 展开才见模式+路径) → 留痕灰字 → 高级折叠 (自定义路径,
 * 仓外显式授权). Six states: valid / registered / nogit(信息态) / missing /
 * parent(chips) / custom-outside.
 *
 * BUILD-stage data layering (the RegisterWizard precedent): the card runs on
 * the injected {@link ConfirmCardFace} mock twin (mocks/workbench
 * createMockConfirmCardFace); 1.6 wires the Interface 1 IPC verbs and mounts
 * the card behind the 左栏 ＋ and the 空态引导 (同一实例语义:注册唯一入口).
 *
 * Sticky ban (黏性禁令, P0): every landed report REBUILDS the placement draft
 * — manual selection cleared, custom path emptied, authorization reset — so
 * an in-repo placement can never be inherited across projects (仓内落点永不
 * 继承). Submit failures stay in the card for correction (提交失败留在卡内修
 * 正不静默); success hands { project, modeLabel } to the host for the 落位
 * toast (原位生效不出页).
 */
import { useEffect, useRef, useState } from 'react'
import type { DetectReport, Project } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../chrome/ChromeButton'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader,
  ghostButtonStyle, primaryButtonStyle,
} from '../../views/tasks/launch/LaunchStates'
import { normalizeWorkbenchVerbError } from '../../ipc/workbench'
import { directoryNameOf } from '../../paths'
import {
  anchorOf, buildSubmitInput, canSubmit, checkEntry, defaultPlacement,
  evidenceTierOf, machinePhaseOf, resolvePlacement, stripEntryInput,
  type CardPhase, type ConfirmCardFace,
} from './card-state'
import { DetectRow } from './DetectRow'
import { DocsPlacementPreview } from './DocsPlacementPreview'
import { AdvancedSection } from './AdvancedSection'

export interface ConfirmCardProps {
  t: (key: WorkbenchKey) => string
  /** The verb seam — mock twin in 1.5; 1.6 injects the IPC-backed face. */
  face: ConfirmCardFace
  /** Every close path (Esc / mask / ✕ / [取消]) funnels here. */
  onCancel: () => void
  /** 注册成功 — the host toasts (含落位模式) and lands 原位生效. */
  onDone: (result: { project: Project; modeLabel: string }) => void
  /** 已注册快车道 (decisions §5.4): the host toasts 「已注册 · 打开」 and locates the row. */
  onLocateRegistered?: ((hit: { projectId: string; displayName: string }) => void) | undefined
  /** 浏览… directory picker (absent = the button is not rendered; 1.6 wires the host dialog). */
  onBrowse?: (() => void) | undefined
}

type DetectReportShape = DetectReport

const subtitleStyle = {
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '2px 0 0',
} as const

const formRowStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
} as const

const labelStyle = {
  color: 'var(--dsw-alias-label-primary, CanvasText)',
  fontSize: '13px',
  lineHeight: '20px',
} as const

const requiredStyle = { color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))' } as const

const pathLineStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
} as const

const pathInputStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '10px',
  color: 'var(--dsw-alias-label-primary, CanvasText)',
  flex: 1,
  font: 'inherit',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '12px',
  height: '32px',
  minWidth: 0,
  padding: '0 10px',
} as const

const nameInputStyle = {
  ...pathInputStyle,
  fontFamily: 'var(--font-ui, inherit)',
} as const

const traceStyle = {
  color: 'var(--dsw-alias-label-tertiary, GrayText)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const submitErrorStyle = {
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** The 添加项目确认卡 (un-mounted in 1.5; 1.6 owns the entry seats). */
export function ConfirmCard(props: ConfirmCardProps) {
  const { face } = props
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<CardPhase>({ kind: 'idle' })
  const [report, setReport] = useState<DetectReportShape | null>(null)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState(() => defaultPlacement(null))
  const [expanded, setExpanded] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | null>(null)
  const nameTouchedRef = useRef(false)
  const probeSeqRef = useRef(0)
  const codeInputRef = useRef<HTMLInputElement>(null)

  const anchor = report !== null ? anchorOf(report) : null
  const tier = report !== null ? evidenceTierOf(report) : null
  const resolution = resolvePlacement(anchor, tier, draft)
  const submitAllowed = canSubmit(report, name, resolution)
  // The preview row is meaningful exactly for the placement-carrying states.
  const previewUsable = phase.kind === 'valid' || phase.kind === 'nogit' || phase.kind === 'parent'

  /** A landed report rebuilds the draft — the sticky ban's single choke point. */
  const applyReport = (next: DetectReportShape): void => {
    setReport(next)
    setPhase(machinePhaseOf(next))
    setDraft(defaultPlacement(anchorOf(next)))
    if (!nameTouchedRef.current) {
      setName(next.exists && next.isDir ? directoryNameOf(anchorOf(next)) : '')
    }
  }

  /** 代码区 input — entry check, then probe (latest-wins; earlier reports dropped). */
  const handleCode = (next: string): void => {
    const seq = probeSeqRef.current + 1
    probeSeqRef.current = seq
    setCode(next)
    setSubmitError(null)
    setAuthError(null)
    const check = checkEntry(next)
    if (!check.ok) {
      setReport(null)
      setPhase(check.reason === 'empty' ? { kind: 'idle' } : { kind: 'invalid-entry', reason: check.reason })
      return
    }
    setReport(null)
    setPhase({ kind: 'probing' })
    void face.probeProjectPath({ path: stripEntryInput(next) }).then(
      (probed) => {
        if (probeSeqRef.current !== seq) return
        applyReport(probed)
      },
      () => {
        // Detection never rejects on the real chain (detect.ts degrades into
        // the report shape); a broken mock degrades to idle, never a crash.
        if (probeSeqRef.current !== seq) return
        setPhase({ kind: 'idle' })
      },
    )
  }

  // 快车道: a registered hit hands the host the locate action (toast
  // 「已注册 · 打开」) — once per landed report; only the hit payload, never
  // the internal phase shape.
  useEffect(() => {
    if (phase.kind === 'registered') {
      props.onLocateRegistered?.({ projectId: phase.projectId, displayName: phase.displayName })
    }
  }, [phase])

  const pickMode = (mode: 'app' | 'repo-new' | 'repo-existing'): void => {
    // Manual pick clears custom + authorization (prototype parity).
    setDraft(current => ({ ...current, manualMode: mode, customPath: '', customAuthorized: false }))
    setAuthError(null)
  }

  const changeDocsPath = (value: string): void => {
    // Editing the 仓内 path box flips to 仓内新建 (an edit can't express 沿用).
    setDraft(current => ({ ...current, docsPath: value, docsPathTouched: true, manualMode: 'repo-new' }))
  }

  const changeCustom = (value: string): void => {
    // Any custom edit voids the authorization (re-auth per value).
    setDraft(current => ({ ...current, customPath: value, customAuthorized: false }))
    setAuthError(null)
  }

  const grantAuthorization = (): void => {
    const path = draft.customPath.trim()
    const authorize = face.authorizeExternalDocPath
    if (authorize === undefined) {
      setDraft(current => ({ ...current, customAuthorized: true }))
      return
    }
    void authorize(path).then(
      () => {
        setDraft(current => ({ ...current, customAuthorized: true }))
        setAuthError(null)
      },
      (error: unknown) => {
        // 授权行错误态 (ERR_EXTERNAL_PATH_UNREADABLE family) — stays for correction.
        setAuthError(normalizeWorkbenchVerbError(error).code)
      },
    )
  }

  const submit = (): void => {
    if (submitting || anchor === null || !canSubmit(report, name, resolution)) return
    setSubmitting(true)
    setSubmitError(null)
    void face.registerProject(buildSubmitInput(anchor, name, resolution)).then(
      (project) => {
        const modeLabel = resolution.mode === 'repo-new'
          ? `${props.t('confirmCard.mode.repo-new')}(${resolution.docsPath ?? ''})`
          : resolution.mode === 'repo-existing'
            ? props.t('confirmCard.mode.repo-existing')
            : resolution.mode === 'custom'
              ? props.t('confirmCard.mode.custom')
              : props.t('confirmCard.mode.app')
        props.onDone({ project, modeLabel })
      },
      (error: unknown) => {
        // 提交失败留在卡内修正,不静默 (spec Error Handling: Propagation).
        setSubmitError(normalizeWorkbenchVerbError(error))
        setSubmitting(false)
      },
    )
  }

  return (
    <DialogFrame
      role="dialog"
      ariaLabelledBy="dsh-forge-confirm-title"
      initialFocus={codeInputRef}
      onDismiss={props.onCancel}
      dialogDataKey="confirm-card"
    >
      <DialogHeader
        id="dsh-forge-confirm-title"
        title={props.t('confirmCard.title')}
        closeLabel={props.t('confirmCard.close')}
        onClose={props.onCancel}
      />
      <p style={subtitleStyle}>{props.t('confirmCard.subtitle')}</p>
      <DialogBody>
        <div style={formRowStyle}>
          <label style={labelStyle} htmlFor="dsh-forge-confirm-code">
            {props.t('confirmCard.code.label')} <span aria-hidden="true" style={requiredStyle}>*</span>
          </label>
          <div style={pathLineStyle}>
            <input
              id="dsh-forge-confirm-code"
              ref={codeInputRef}
              data-dsh-forge-confirm-code=""
              value={code}
              placeholder={props.t('confirmCard.code.placeholder')}
              spellCheck={false}
              style={pathInputStyle}
              onChange={(event) => { handleCode(event.target.value) }}
            />
            {props.onBrowse !== undefined && (
              <ChromeButton
                type="button"
                data-dsh-forge-confirm-browse=""
                style={ghostButtonStyle}
                onClick={props.onBrowse}
              >
                {props.t('confirmCard.code.browse')}
              </ChromeButton>
            )}
          </div>
          <DetectRow t={props.t} phase={phase} report={report} onPickChild={handleCode} />
        </div>
        <div style={formRowStyle}>
          <label style={labelStyle} htmlFor="dsh-forge-confirm-name">{props.t('confirmCard.name.label')}</label>
          <input
            id="dsh-forge-confirm-name"
            data-dsh-forge-confirm-name=""
            value={name}
            placeholder={props.t('confirmCard.name.placeholder')}
            style={nameInputStyle}
            onChange={(event) => {
              nameTouchedRef.current = true
              setName(event.target.value)
            }}
          />
        </div>
        {previewUsable && (
          <div style={formRowStyle}>
            <span style={labelStyle}>{props.t('confirmCard.docs.label')}</span>
            <DocsPlacementPreview
              t={props.t}
              tier={tier}
              draft={draft}
              resolution={resolution}
              expanded={expanded}
              onToggle={() => { setExpanded(!expanded) }}
              onPickMode={pickMode}
              onDocsPathChange={changeDocsPath}
            />
          </div>
        )}
        <div data-dsh-forge-confirm-trace="" style={traceStyle}>{props.t('confirmCard.trace')}</div>
        <AdvancedSection
          t={props.t}
          anchor={anchor}
          draft={draft}
          authError={authError}
          onCustomChange={changeCustom}
          onGrant={grantAuthorization}
        />
        {submitError !== null && (
          <div data-dsh-forge-confirm-submit-error="" role="alert" style={submitErrorStyle}>
            {props.t('confirmCard.submit.failed')} ({submitError.code})
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          type="button"
          data-dsh-forge-confirm-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('confirmCard.cancel')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-confirm-submit=""
          style={primaryButtonStyle}
          disabled={!submitAllowed || submitting}
          onClick={submit}
        >
          {submitting ? props.t('confirmCard.submit.busy') : props.t('confirmCard.submit')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
