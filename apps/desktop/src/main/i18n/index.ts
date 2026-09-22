// i18n — Interface 7 of the M1 tech design (壳层文案中英双语,接入上游 locale 机制).
//
// Locale source (spike-3 findings, §3 — fixed decision ①): the shell reads the
// upstream Host user-settings document directly and read-only at init():
//   `$DSH_HOME/settings.yaml` → key `locale.preference`
// (upstream refs: packages/client/locale/src/locale-settings.ts:5-20 —
// LOCALE_SETTINGS_NAMESPACE='locale', LOCALE_PREFERENCE_FIELD='preference',
// LOCALE_ID_PATTERN; packages/settings/settings-file/src/index.ts:52-57 — the
// document lives at `<harness home>/settings.yaml`).
//
// Resolution rules (frozen per spike-3):
//   - value 'zh' | 'en' → adopted as-is
//   - BCP 47-style value (e.g. 'zh-CN', 'en-US') → normalized by primary
//     subtag (upstream detectBrowserLocale-style); 'en*' → 'en', else 'zh'
//   - file missing / key missing / parse failure / non-string → default 'zh'
//   - read once at init(); no change watching, no cross-process writes — the
//     shell never rewrites upstream settings, and copy follows the user's
//     preference on the next launch.

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { dictionaries, type CopyKey, type Locale } from './copy.ts'

export type { CopyKey, Locale }

/** Upstream BCP 47-style language id pattern (locale-settings.ts:9). */
const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** Settings key namespace/field owned by the upstream locale plugin. */
const LOCALE_SETTINGS_NAMESPACE = 'locale'
const LOCALE_PREFERENCE_FIELD = 'preference'

/** Overrides for tests: point the reader at an isolated fixture path. */
export interface I18nDeps {
  /** Full path to the settings document; defaults to `$DSH_HOME/settings.yaml`. */
  settingsFile?: string
  /** `$DSH_HOME` override; defaults to `DSH_HOME` env, then `~/.dsh` (upstream order). */
  dshHome?: string
}

let currentLocale: Locale = 'zh'
let initialized = false

function resolveSettingsFile(deps?: I18nDeps): string {
  if (deps?.settingsFile !== undefined) return deps.settingsFile
  const home = deps?.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'settings.yaml')
}

/**
 * Normalize a raw preference value per the frozen spike-3 rules.
 * Package-private (exported for tests).
 */
export function normalizeLocaleId(raw: unknown): Locale {
  if (typeof raw !== 'string' || raw === '' || !LOCALE_ID_PATTERN.test(raw)) return 'zh'
  const primary = raw.split('-')[0] ?? raw
  return primary === 'en' ? 'en' : 'zh'
}

/**
 * Read the upstream locale preference (read-only). Never writes back.
 * Any failure path resolves to the default locale 'zh'.
 */
export async function init(deps?: I18nDeps): Promise<void> {
  let preference: unknown
  try {
    const text = await readFile(resolveSettingsFile(deps), 'utf8')
    const doc = parseYaml(text) as unknown
    if (doc !== null && typeof doc === 'object') {
      const namespace = (doc as Record<string, unknown>)[LOCALE_SETTINGS_NAMESPACE]
      if (namespace !== null && typeof namespace === 'object') {
        preference = (namespace as Record<string, unknown>)[LOCALE_PREFERENCE_FIELD]
      }
    }
  } catch {
    // Missing file / unreadable / malformed YAML → default 'zh'.
    preference = undefined
  }
  currentLocale = normalizeLocaleId(preference)
  initialized = true
}

/** Current locale; 'zh' until init() completes (and forever if init() is skipped). */
export function getLocale(): Locale {
  return currentLocale
}

/** True once init() has run (test-support introspection). */
export function isInitialized(): boolean {
  return initialized
}

/** Reset to the pre-init default (test-support only). */
export function resetForTest(): void {
  currentLocale = 'zh'
  initialized = false
}

/**
 * Translate a shell CopyKey, interpolating `{param}` placeholders with the
 * given values. Unknown params are left verbatim; a missing key is a type
 * error (CopyKey union) and falls back to the key itself at runtime.
 */
export function t(key: CopyKey, params?: Record<string, string | number>): string {
  const template = dictionaries[currentLocale][key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match)
}
