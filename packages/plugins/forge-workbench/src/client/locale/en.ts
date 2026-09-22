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
  | 'chrome.addProject'
  | 'switcher.label'
  | 'switcher.empty'
  | 'switcher.emptyHint'
  | 'gate.title'
  | 'gate.body'
  | 'gate.register'
  | 'launch.entry'
  | 'launch.primary'
  | 'launch.probing'
  | 'launch.reason.noPrompt'
  | 'launch.reason.cliUnavailable'
  | 'launch.confirm.title'
  | 'launch.confirm.task'
  | 'launch.confirm.cwd'
  | 'launch.confirm.explain'
  | 'launch.confirm.promptLabel'
  | 'launch.confirm.expand'
  | 'launch.confirm.collapse'
  | 'launch.confirm.ok'
  | 'launch.confirm.cancel'
  | 'launch.initiating'
  | 'launch.degraded.title'
  | 'launch.degraded.copied'
  | 'launch.degraded.guide'
  | 'launch.degraded.dismiss'
  | 'launch.error.title'
  | 'launch.error.clipboard'
  | 'launch.error.unexpected'
  | 'launch.error.retry'
  | 'launch.error.close'
  | 'overview.meta.codeRoot'
  | 'overview.meta.docLocation'
  | 'overview.doc.inRepo'
  | 'overview.doc.external'
  | 'overview.card.activate'
  | 'overview.card.rename'
  | 'overview.card.remove'
  | 'overview.card.activeBadge'
  | 'overview.card.lostBadge'
  | 'overview.card.lastActivated'
  | 'overview.card.neverActivated'
  | 'overview.rename.label'
  | 'overview.rename.hint'
  | 'overview.remove.title'
  | 'overview.remove.promise'
  | 'overview.remove.hint'
  | 'overview.remove.confirm'
  | 'overview.remove.cancel'
  | 'overview.empty.title'
  | 'overview.empty.body'
  | 'overview.empty.register'
  | 'overview.loading'
  | 'overview.loadError.title'
  | 'overview.loadError.retry'
  | 'overview.lost.title'
  | 'overview.lost.body'
  | 'overview.lost.repoint'
  | 'overview.lost.remove'
  | 'overview.toast.activated'
  | 'overview.toast.refreshed'
  | 'overview.toast.failed'
  | 'overview.toast.dismiss'
  | 'overview.plugins.title'
  | 'overview.plugins.reserved'

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
  'chrome.addProject': 'Add project',
  'switcher.label': 'Active project',
  'switcher.empty': 'No projects yet',
  'switcher.emptyHint': 'Register a forge project to activate the workbench.',
  'gate.title': 'No active project',
  'gate.body': 'Tasks and features are organized per project. Register a project to unlock these views.',
  'gate.register': 'Register a project',
  'launch.entry': 'Launch session',
  'launch.primary': 'Launch session',
  'launch.probing': 'Checking the task execution prompt…',
  'launch.reason.noPrompt': 'This task has no execution prompt, so no session can be launched from it.',
  'launch.reason.cliUnavailable': 'The forge CLI could not be resolved. Set an explicit path in settings and retry.',
  'launch.confirm.title': 'Launch session',
  'launch.confirm.task': 'Task',
  'launch.confirm.cwd': 'Working directory',
  'launch.confirm.explain': 'A new dsh session will be created in the project working directory, with the task execution prompt as its first user message.',
  'launch.confirm.promptLabel': 'Execution prompt (first user message, read-only)',
  'launch.confirm.expand': 'Show full prompt',
  'launch.confirm.collapse': 'Collapse prompt',
  'launch.confirm.ok': 'Launch session',
  'launch.confirm.cancel': 'Cancel',
  'launch.initiating': 'Launching session…',
  'launch.degraded.title': 'Manual launch',
  'launch.degraded.copied': 'The task prompt has been copied to the clipboard.',
  'launch.degraded.guide': 'Switch to the session view and paste it as the first message to launch manually.',
  'launch.degraded.dismiss': 'Dismiss',
  'launch.error.title': 'Launch failed',
  'launch.error.clipboard': 'Copying the prompt to the clipboard failed, so the manual fallback could not be prepared.',
  'launch.error.unexpected': 'The launch chain failed unexpectedly.',
  'launch.error.retry': 'Retry',
  'launch.error.close': 'Close',
  'overview.meta.codeRoot': 'Code root',
  'overview.meta.docLocation': 'Docs location',
  'overview.doc.inRepo': 'In repo',
  'overview.doc.external': 'External',
  'overview.card.activate': 'Activate',
  'overview.card.rename': 'Rename',
  'overview.card.remove': 'Remove',
  'overview.card.activeBadge': 'Current',
  'overview.card.lostBadge': 'Directory unreachable',
  'overview.card.lastActivated': 'Last activated',
  'overview.card.neverActivated': 'Never activated',
  'overview.rename.label': 'Project display name',
  'overview.rename.hint': 'Enter to save · Esc to cancel',
  'overview.remove.title': 'Remove project',
  'overview.remove.promise': 'Only the workbench registration is removed — no files inside the repository are deleted.',
  'overview.remove.hint': 'You can register the project again at any time.',
  'overview.remove.confirm': 'Remove',
  'overview.remove.cancel': 'Cancel',
  'overview.empty.title': 'No projects yet',
  'overview.empty.body': 'Register a forge project to switch the workbench between your projects.',
  'overview.empty.register': 'Register a project',
  'overview.loading': 'Loading projects…',
  'overview.loadError.title': 'Failed to load projects',
  'overview.loadError.retry': 'Retry',
  'overview.lost.title': 'Active project directory unreachable',
  'overview.lost.body': 'The registered path can no longer be reached. Repoint the project to a valid location, or remove its registration (project files are never touched).',
  'overview.lost.repoint': 'Repoint',
  'overview.lost.remove': 'Remove project',
  'overview.toast.activated': 'Activated {name}',
  'overview.toast.refreshed': 'Project list refreshed',
  'overview.toast.failed': 'Action failed: {message}',
  'overview.toast.dismiss': 'Dismiss',
  'overview.plugins.title': 'Plugins',
  'overview.plugins.reserved': 'The plugin management section arrives with M2 5.12.',
}
