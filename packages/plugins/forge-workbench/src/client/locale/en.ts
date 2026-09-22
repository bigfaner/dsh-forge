/**
 * The forge-workbench dictionary, English half — also the source of the
 * namespace's key union and the fallback copy (FALLBACK_LOCALE = 'en': any
 * locale missing a key resolves through the chain to these strings).
 */

/** Dictionary key union of the workbench namespace (LocaleNamespaceMap merge target). */
export type WorkbenchKey =
  | 'panel'
  | 'shell.title'
  | 'shell.placeholder'
  | 'view.session'
  | 'rail.label'
  | 'tabs.label'
  | 'tab.overview'
  | 'tab.tasks'
  | 'tab.features'

/** English copy (the fallback locale). */
export const en: Record<WorkbenchKey, string> = {
  'panel': 'Workbench',
  'shell.title': 'forge workbench',
  'shell.placeholder': 'Workbench shell — task board, details, and feature views arrive in M2 5.x',
  'view.session': 'Sessions',
  'rail.label': 'Primary view switch',
  'tabs.label': 'Workbench views',
  'tab.overview': 'Overview',
  'tab.tasks': 'Tasks',
  'tab.features': 'Features',
}
