// workbench/components/confirm-card/card-state — C7 添加项目确认卡's pure
// state machine (task 1.5; ui-design C7 全节 + workbench-layout-v2 §2.2 ＋ 行
// 裁决 #24 九条 + decisions/project-storage-and-knowledge.md §5 v2). No React
// here: every rule below is unit-assertable and shared verbatim by the
// component and its build-stage mock twin (mocks/workbench.ts).
//
//   entry hygiene   — strip wrapping quotes (拖拽/粘贴 armor), reject bare
//                     drives / filesystem roots / relative paths at the input
//                     (the client twin of main-side normalizeEntry; the probe
//                     belt-and-braces mirrors it via DetectReport.pathKey
//                     === null);
//   evidence tier   — decisions §5.3 证据三档: forgeTreeHit → repo-existing
//                     (沿用仓内) / gitRoot → repo-new (仓内新建,懒物化) /
//                     neither → app (应用管理,主路径非兜底;零 git 强制);
//   six states      — valid / registered / nogit(信息态,非错误;硬校验两条
//                     = 存在+目录+可读 与 跨项目唯一) / missing / parent
//                     (子仓 chips) / custom-outside (高级折叠授权行,组件层);
//   sticky ban      — the placement draft is DERIVED per report (换路径预选
//                     重估:手动选择清零/自定义清空/授权复位), so an in-repo
//                     placement can never leak across projects (仓内落点永不
//                     继承 — P0 防跨项目静默写入无关仓库).
import type { DetectReport, Project, RegisterProjectInputV2 } from '../../ipc-types'
import { normalizePathForCompare } from '../../paths'

/** The card's verb seam (Interface 1 v3): 1.5 builds against the mock twin; 1.6 wires the IPC bridge. */
export interface ConfirmCardFace {
  /** Interface 1 probeProjectPath — the C7 侦测 verb (mock-built in 1.5). */
  probeProjectPath(input: { readonly path: string }): Promise<DetectReport>
  /** Interface 1 registerProject v2 face — the ONLY write, fired solely from [添加项目]. */
  registerProject(input: RegisterProjectInputV2): Promise<Project>
  /**
   * 仓外自定义显式授权 + 复检 (BIZ-001/003 收窄至高级自定义): absent = the
   * build-stage local grant (prototype parity); a rejection — serialized
   * WorkbenchVerbError, ERR_EXTERNAL_PATH_UNREADABLE — lands as the 授权行
   * 错误态 (spec Error Handling).
   */
  authorizeExternalDocPath?(path: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Entry hygiene (代码区唯一输入位)
// ---------------------------------------------------------------------------

/** Strip wrapping double quotes + whitespace (drag/paste armor, prototype strip()). */
export function stripEntryInput(raw: string): string {
  return raw.trim().replace(/^["]+|["]+$/g, '')
}

/** Entry rejection reasons (the main-side normalizeEntry vocabulary). */
export type EntryRejection = 'empty' | 'relative' | 'bare-drive-or-root'

export type EntryCheck =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: EntryRejection }

const BARE_DRIVE = /^[A-Za-z]:[\\/]?$/
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/
const UNC_PREFIX = /^(\\\\|\/\/)/

/**
 * Client-side entry check (win32 twin of projects-identity normalizeEntry):
 * absolute drive paths and UNC paths pass; bare drives, filesystem roots and
 * relative paths are rejected before any probe fires (零 fs 访问).
 */
export function checkEntry(raw: string): EntryCheck {
  const stripped = stripEntryInput(raw)
  if (stripped === '') return { ok: false, reason: 'empty' }
  if (BARE_DRIVE.test(stripped)) return { ok: false, reason: 'bare-drive-or-root' }
  if (!DRIVE_ABSOLUTE.test(stripped) && !UNC_PREFIX.test(stripped)) {
    return { ok: false, reason: 'relative' }
  }
  // Root forms ('Z:\', '\\server', '\\server\share') are not project roots.
  const norm = stripped.replaceAll('\\', '/').replace(/\/+$/, '')
  if (/^[A-Za-z]:$/.test(norm)) return { ok: false, reason: 'bare-drive-or-root' }
  if (/^\/\/[^/]+(\/[^/]+)?$/.test(norm)) return { ok: false, reason: 'bare-drive-or-root' }
  return { ok: true, path: stripped }
}

// ---------------------------------------------------------------------------
// Evidence three-tier gating (decisions §5.3)
// ---------------------------------------------------------------------------

/** ③ docs_root 证据三档 (CHECK 5 值 minus custom/legacy — those are card actions). */
export type EvidenceTier = 'repo-existing' | 'repo-new' | 'app'

/**
 * The evidence tier a DetectReport licenses: 命中仓内 forge 树 = 沿用仓内 /
 * 有 `.git` = 仓内新建 / 无 `.git` = 应用管理. Null when the report carries no
 * evaluable directory (rejected entry / missing / not a dir).
 */
export function evidenceTierOf(report: DetectReport): EvidenceTier | null {
  if (report.pathKey === null) return null
  if (!report.exists || !report.isDir) return null
  if (report.forgeTreeHit) return 'repo-existing'
  if (report.gitRoot !== null) return 'repo-new'
  return 'app'
}

// ---------------------------------------------------------------------------
// Six-state machine
// ---------------------------------------------------------------------------

/** The card's six states (+ idle/probing transitional phases). */
export type CardPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'invalid-entry'; readonly reason: EntryRejection }
  | { readonly kind: 'probing' }
  | { readonly kind: 'registered'; readonly projectId: string; readonly displayName: string }
  | { readonly kind: 'missing'; readonly variant: 'not-exists' | 'not-dir' | 'unreadable' }
  | { readonly kind: 'parent' }
  | { readonly kind: 'valid' }
  | { readonly kind: 'nogit' }

/**
 * DetectReport → the 侦测行's single state. Precedence (prototype parity):
 * rejected entry > registered fast lane > missing (硬校验 ①) > parent chips >
 * git-bearing valid > nogit 信息态. A parent directory still passes 存在
 * (chips are a suggestion, not a block — decisions §5.4 父目录误选).
 */
export function machinePhaseOf(report: DetectReport | null): CardPhase {
  if (report === null) return { kind: 'idle' }
  if (report.pathKey === null) {
    // The main-side normalizeEntry rejected this entry — the client twin
    // classifies locally before probing; this is the report-shaped mirror.
    return { kind: 'invalid-entry', reason: 'bare-drive-or-root' }
  }
  if (report.registered !== null) {
    return { kind: 'registered', projectId: report.registered.projectId, displayName: report.registered.displayName }
  }
  if (!report.exists) return { kind: 'missing', variant: 'not-exists' }
  if (!report.isDir) return { kind: 'missing', variant: 'not-dir' }
  if (!report.readable) return { kind: 'missing', variant: 'unreadable' }
  if (report.childRepos.length >= 2) return { kind: 'parent' }
  if (report.gitRoot !== null) return { kind: 'valid' }
  return { kind: 'nogit' }
}

/** The report's anchor: canonical display form, or the stripped input on realpath fallback. */
export function anchorOf(report: DetectReport): string {
  return report.canonicalPath ?? stripEntryInput(report.input)
}

// ---------------------------------------------------------------------------
// Placement draft + preview resolution (文档位置预览行)
// ---------------------------------------------------------------------------

/** Interface 1 docsPlacement's four card-reachable values. */
export type PlacementMode = 'repo-existing' | 'repo-new' | 'app' | 'custom'

/**
 * The ✎ panel + advanced fold's editable state. Rebuilt per report
 * (defaultPlacement) — the sticky ban's structural guarantee: nothing here
 * survives a path change.
 */
export interface PlacementDraft {
  /** null = evidence preselect; a manual radio pick / path edit overrides. */
  readonly manualMode: EvidenceTier | null
  /** 仓内 path box (default `<anchor>/docs`). */
  readonly docsPath: string
  /** True once the user typed in the 仓内 path box. */
  readonly docsPathTouched: boolean
  /** 高级:自定义文档路径 (custom overrides every radio). */
  readonly customPath: string
  /** 仓外显式授权位 (resets on every path change and custom edit). */
  readonly customAuthorized: boolean
}

/** The empty card's draft (idle — nothing probed yet). */
export const EMPTY_PLACEMENT: PlacementDraft = {
  manualMode: null,
  docsPath: '',
  docsPathTouched: false,
  customPath: '',
  customAuthorized: false,
}

/** The per-report draft reset: evidence preselect, default `<anchor>/docs`, authorization cleared. */
export function defaultPlacement(anchor: string | null): PlacementDraft {
  const base = anchor !== null ? normalizePathForCompare(anchor) : ''
  return {
    manualMode: null,
    docsPath: base !== '' ? `${base}/docs` : '',
    docsPathTouched: false,
    customPath: '',
    customAuthorized: false,
  }
}

/**
 * 仓外判定 (win32 case-folded prefix compare): a custom path is OUTSIDE when
 * it neither equals the anchor nor lives under it. An empty custom path or a
 * missing anchor is never outside (prototype parity).
 */
export function isCustomOutside(anchor: string | null, customPath: string): boolean {
  const custom = normalizePathForCompare(customPath).toUpperCase()
  if (custom === '') return false
  if (anchor === null) return false
  const base = normalizePathForCompare(anchor).toUpperCase()
  if (base === '') return false
  if (custom === base) return false
  return !custom.startsWith(`${base}/`)
}

/** What the preview row shows + what the submit sends for one resolved placement. */
export interface PlacementResolution {
  readonly mode: PlacementMode
  /** Submit payload path — repo-new / custom only (repo-existing 沿用, app = kernel-derived). */
  readonly docsPath: string | null
  /** Preview-row path — repo modes show `<anchor>/docs`; app is label-only; custom shows itself. */
  readonly previewPath: string | null
  /** custom ⊄ anchor. */
  readonly customOutside: boolean
  /** custom outside AND not yet explicitly authorized (blocks submit). */
  readonly needsAuthorization: boolean
}

/**
 * Priority: a filled custom path overrides every radio; otherwise the manual
 * pick; otherwise the evidence tier. Sticky-free by construction — the inputs
 * (draft/tier) are per-report values.
 */
export function resolvePlacement(
  anchor: string | null,
  tier: EvidenceTier | null,
  draft: PlacementDraft,
): PlacementResolution {
  const custom = draft.customPath.trim()
  if (custom !== '') {
    const outside = isCustomOutside(anchor, custom)
    return {
      mode: 'custom',
      docsPath: custom,
      previewPath: custom,
      customOutside: outside,
      needsAuthorization: outside && !draft.customAuthorized,
    }
  }
  const mode: PlacementMode = draft.manualMode ?? tier ?? 'app'
  if (mode === 'app') {
    return { mode, docsPath: null, previewPath: null, customOutside: false, needsAuthorization: false }
  }
  // repo-existing previews the canonical <root>/docs (an edit flips the manual
  // mode to repo-new, so 沿用 never carries a hand-typed path); repo-new
  // carries the box value, falling back to the default.
  const fallback = anchor !== null && normalizePathForCompare(anchor) !== ''
    ? `${normalizePathForCompare(anchor)}/docs`
    : ''
  if (mode === 'repo-existing') {
    return { mode, docsPath: null, previewPath: fallback, customOutside: false, needsAuthorization: false }
  }
  const docsPath = draft.docsPath.trim() !== '' ? draft.docsPath.trim() : fallback
  return { mode, docsPath, previewPath: docsPath, customOutside: false, needsAuthorization: false }
}

// ---------------------------------------------------------------------------
// Submit gate + payload (硬校验两条 + enabled)
// ---------------------------------------------------------------------------

/**
 * [添加项目] enabled = 存在(且为目录、可读)∧ 未注册 ∧ 名称非空 ∧ 自定义已授权.
 * Parent dirs pass 存在 (chips suggest, never block); nogit passes (零 git
 * 强制 — 无 .git 是一等公民).
 */
export function canSubmit(report: DetectReport | null, name: string, resolution: PlacementResolution): boolean {
  if (report === null || report.pathKey === null) return false
  if (!report.exists || !report.isDir || !report.readable) return false
  if (report.registered !== null) return false
  if (name.trim() === '') return false
  return !resolution.needsAuthorization
}

/**
 * The registerProject v2 payload: `docsPath` only for repo-new / custom
 * (Interface 1 必填); `customAuthorized: true` only for custom (BIZ-001/003).
 */
export function buildSubmitInput(
  anchor: string,
  displayName: string,
  resolution: PlacementResolution,
): RegisterProjectInputV2 {
  const base = { anchor, displayName: displayName.trim() }
  if (resolution.mode === 'repo-new') {
    const docsPath = resolution.docsPath ?? `${normalizePathForCompare(anchor)}/docs`
    return { ...base, docsPlacement: 'repo-new', docsPath }
  }
  if (resolution.mode === 'custom') {
    return { ...base, docsPlacement: 'custom', docsPath: resolution.docsPath ?? '', customAuthorized: true }
  }
  if (resolution.mode === 'repo-existing') {
    return { ...base, docsPlacement: 'repo-existing' }
  }
  return { ...base, docsPlacement: 'app' }
}
