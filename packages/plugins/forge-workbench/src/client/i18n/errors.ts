/**
 * The register wizard's centralized error-code → copy routing (task 5.4
 * Implementation Note: 错误码→文案表集中一处). Every `ERR_*` code the wizard
 * surfaces (tech-design §Error Handling — the six registration-chain codes
 * with a UI row) maps to exactly one inline-message key and one
 * correction-guidance key of the plugin's `workbench` locale namespace.
 *
 * Bilingual discipline: the COPY itself lives in the locale halves
 * (locale/en.ts + locale/zh.ts — the typed registration enforces the balance),
 * NOT here — ui-design 全局规则: 文案一律经上游 locale 机制(zh/en),不自建
 * 文案通道. This module is therefore the single ROUTING table, the piece that
 * stays in one place: a code added without its dictionary keys fails the
 * parity test instead of rendering a blank.
 */
import type { WorkbenchKey } from '../locale/en'

/** The translate seat shape every consumer passes through. */
export type WizardTranslate = (key: WorkbenchKey) => string

/** Error codes the wizard renders inline (tech-design §Error Types & Codes, UI column). */
export const WIZARD_ERROR_CODES = [
  'ERR_CODE_ROOT_UNREADABLE',
  'ERR_FORGE_NOT_DETECTED',
  'ERR_DOC_PATH_CONFLICT',
  'ERR_EXTERNAL_PATH_UNREADABLE',
  'ERR_PROJECT_EXISTS',
] as const

export type WizardErrorCode = (typeof WIZARD_ERROR_CODES)[number]

/** Narrow an unknown verb rejection / reasonCode to the wizard's vocabulary. */
export function isWizardErrorCode(value: unknown): value is WizardErrorCode {
  return typeof value === 'string' && (WIZARD_ERROR_CODES as readonly string[]).includes(value)
}

/** code → inline message key (逐字段内联文案). */
export const WIZARD_ERROR_MESSAGE_KEYS: Record<WizardErrorCode, WorkbenchKey> = {
  ERR_CODE_ROOT_UNREADABLE: 'wizard.err.codeRootUnreadable',
  ERR_FORGE_NOT_DETECTED: 'wizard.err.forgeNotDetected',
  ERR_DOC_PATH_CONFLICT: 'wizard.err.docPathConflict',
  ERR_EXTERNAL_PATH_UNREADABLE: 'wizard.err.externalPathUnreadable',
  ERR_PROJECT_EXISTS: 'wizard.err.projectExists',
}

/** code → correction-guidance key (修正引导 / 授权说明块); ERR_PROJECT_EXISTS guides via its locate CTA. */
export const WIZARD_ERROR_GUIDANCE_KEYS: Record<WizardErrorCode, WorkbenchKey | undefined> = {
  ERR_CODE_ROOT_UNREADABLE: 'wizard.err.codeRootUnreadable.guide',
  ERR_FORGE_NOT_DETECTED: 'wizard.err.forgeNotDetected.guide',
  ERR_DOC_PATH_CONFLICT: 'wizard.err.docPathConflict.guide',
  ERR_EXTERNAL_PATH_UNREADABLE: 'wizard.err.externalPathUnreadable.guide',
  ERR_PROJECT_EXISTS: undefined,
}

/** The inline copy for a code (routed through the locale seat). */
export function wizardErrorMessage(code: WizardErrorCode, t: WizardTranslate): string {
  return t(WIZARD_ERROR_MESSAGE_KEYS[code])
}

/** The correction guidance for a code, or undefined when the code has none. */
export function wizardErrorGuidance(code: WizardErrorCode, t: WizardTranslate): string | undefined {
  const key = WIZARD_ERROR_GUIDANCE_KEYS[code]
  return key === undefined ? undefined : t(key)
}
