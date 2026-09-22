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
  | 'wizard.title'
  | 'wizard.editTitle'
  | 'wizard.stepLabel'
  | 'wizard.back'
  | 'wizard.next'
  | 'wizard.finish'
  | 'wizard.finishEdit'
  | 'wizard.submitting'
  | 'wizard.submittingEdit'
  | 'wizard.close'
  | 'wizard.locate'
  | 'wizard.step1.title'
  | 'wizard.step1.placeholder'
  | 'wizard.step1.required'
  | 'wizard.step1.checking'
  | 'wizard.step1.detected'
  | 'wizard.step1.readonlyHint'
  | 'wizard.step2.inRepo'
  | 'wizard.step2.inRepoHint'
  | 'wizard.step2.external'
  | 'wizard.step2.externalPlaceholder'
  | 'wizard.step2.required'
  | 'wizard.step2.checking'
  | 'wizard.step2.needAuthorize'
  | 'wizard.step2.authorize'
  | 'wizard.step2.warn'
  | 'wizard.step3.title'
  | 'wizard.step3.nameHint'
  | 'wizard.err.codeRootUnreadable'
  | 'wizard.err.codeRootUnreadable.guide'
  | 'wizard.err.forgeNotDetected'
  | 'wizard.err.forgeNotDetected.guide'
  | 'wizard.err.docPathConflict'
  | 'wizard.err.docPathConflict.guide'
  | 'wizard.err.externalPathUnreadable'
  | 'wizard.err.externalPathUnreadable.guide'
  | 'wizard.err.projectExists'
  | 'wizard.submitFailed'
  | 'wizard.discard.title'
  | 'wizard.discard.editTitle'
  | 'wizard.discard.body'
  | 'wizard.discard.confirm'
  | 'wizard.discard.cancel'
  | 'tasks.views.label'
  | 'tasks.view.tree'
  | 'tasks.view.grouped'
  | 'tasks.view.list'
  | 'tasks.view.treeHint'
  | 'tasks.search.label'
  | 'tasks.search.placeholder'
  | 'tasks.filter.status'
  | 'tasks.filter.statusAll'
  | 'tasks.filter.feature'
  | 'tasks.filter.featureAll'
  | 'tasks.filter.worktree'
  | 'tasks.filters.label'
  | 'tasks.sort.label'
  | 'tasks.sort.status'
  | 'tasks.sort.updatedAt'
  | 'tasks.count'
  | 'tasks.sync.idle'
  | 'tasks.sync.scanning'
  | 'tasks.sync.error'
  | 'tasks.sync.retry'
  | 'tasks.sync.lastScan'
  | 'tasks.sync.neverScanned'
  | 'tasks.loading'
  | 'tasks.empty.title'
  | 'tasks.empty.body'
  | 'tasks.noMatch.title'
  | 'tasks.noMatch.body'
  | 'tasks.noMatch.clear'
  | 'tasks.loadError.title'
  | 'tasks.loadError.retry'
  | 'tasks.column.key'
  | 'tasks.column.title'
  | 'tasks.column.status'
  | 'tasks.column.feature'
  | 'tasks.column.branch'
  | 'tasks.column.worktree'
  | 'tasks.column.source'
  | 'tasks.column.updatedAt'
  | 'tasks.badge.worktree'
  | 'tasks.source.session'
  | 'tasks.source.terminal'
  | 'tasks.dangling'
  | 'tasks.dangling.title'
  | 'tasks.select'
  | 'tasks.group.ariaLabel'
  | 'tasks.updated.announce'
  | 'tasks.status.pending'
  | 'tasks.status.in_progress'
  | 'tasks.status.completed'
  | 'tasks.status.blocked'
  | 'tasks.status.suspended'
  | 'tasks.status.skipped'
  | 'tasks.status.rejected'
  | 'tasks.status.short.pending'
  | 'tasks.status.short.in_progress'
  | 'tasks.status.short.completed'
  | 'tasks.status.short.blocked'
  | 'tasks.status.short.suspended'
  | 'tasks.status.short.skipped'
  | 'tasks.status.short.rejected'

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
  'wizard.title': 'Register project',
  'wizard.editTitle': 'Repoint project',
  'wizard.stepLabel': 'Step {current}/{total}',
  'wizard.back': 'Back',
  'wizard.next': 'Next',
  'wizard.finish': 'Register',
  'wizard.finishEdit': 'Done',
  'wizard.submitting': 'Registering…',
  'wizard.submittingEdit': 'Saving…',
  'wizard.close': 'Close',
  'wizard.locate': 'Show the registered project',
  'wizard.step1.title': 'Choose the code root',
  'wizard.step1.placeholder': 'Absolute path to the project root',
  'wizard.step1.required': 'Enter the code root path first.',
  'wizard.step1.checking': 'Checking for forge data…',
  'wizard.step1.detected': 'Forge data detected: {tasks} tasks · {features} features',
  'wizard.step1.readonlyHint': 'The code root is fixed at registration and cannot change; repointing covers the docs location.',
  'wizard.step2.inRepo': 'In repo (default)',
  'wizard.step2.inRepoHint': 'Feature documents live inside the repository (docs/features).',
  'wizard.step2.external': 'External local path',
  'wizard.step2.externalPlaceholder': 'Absolute path outside the code root',
  'wizard.step2.required': 'The external path is required.',
  'wizard.step2.checking': 'Checking the external path…',
  'wizard.step2.needAuthorize': 'Confirm the authorization to continue.',
  'wizard.step2.authorize': 'I authorize the workbench to read feature documents at this external path.',
  'wizard.step2.warn': 'External path: must differ from the code root, and requires explicit authorization.',
  'wizard.step3.title': 'Confirm registration',
  'wizard.step3.nameHint': 'Defaults to the code root directory name.',
  'wizard.err.codeRootUnreadable': 'This path does not exist or cannot be read.',
  'wizard.err.codeRootUnreadable.guide': 'Fix the path, or initialize the project with forge first.',
  'wizard.err.forgeNotDetected': 'No forge data detected at this path (neither .forge/ nor a docs location).',
  'wizard.err.forgeNotDetected.guide': 'Correct the path, or initialize the project with forge first.',
  'wizard.err.docPathConflict': 'The docs path must differ from the code root.',
  'wizard.err.docPathConflict.guide': 'Choose a directory outside the code root.',
  'wizard.err.externalPathUnreadable': 'The external path cannot be read or is not fully authorized.',
  'wizard.err.externalPathUnreadable.guide': 'Check that the path exists, then complete the authorization below.',
  'wizard.err.projectExists': 'This code root is already registered.',
  'wizard.submitFailed': 'Registration failed: {message}',
  'wizard.discard.title': 'Discard registration?',
  'wizard.discard.editTitle': 'Discard changes?',
  'wizard.discard.body': 'The values entered so far will be lost.',
  'wizard.discard.confirm': 'Discard',
  'wizard.discard.cancel': 'Keep editing',
  'tasks.views.label': 'Task board views',
  'tasks.view.tree': 'Dependency tree',
  'tasks.view.grouped': 'By status',
  'tasks.view.list': 'List',
  'tasks.view.treeHint': 'The dependency-tree view arrives with task 5.6.',
  'tasks.search.label': 'Search tasks',
  'tasks.search.placeholder': 'Search title or task number',
  'tasks.filter.status': 'Status',
  'tasks.filter.statusAll': 'All statuses',
  'tasks.filter.feature': 'Feature',
  'tasks.filter.featureAll': 'All features',
  'tasks.filter.worktree': 'Worktree only',
  'tasks.filters.label': 'Filters',
  'tasks.sort.label': 'Sort',
  'tasks.sort.status': 'By status',
  'tasks.sort.updatedAt': 'By updated time',
  'tasks.count': '{visible} of {total} tasks',
  'tasks.sync.idle': 'Synced',
  'tasks.sync.scanning': 'Scanning…',
  'tasks.sync.error': 'Sync failed',
  'tasks.sync.retry': 'Retry',
  'tasks.sync.lastScan': 'Last scan {time}',
  'tasks.sync.neverScanned': 'Never scanned',
  'tasks.loading': 'Loading tasks…',
  'tasks.empty.title': 'No tasks',
  'tasks.empty.body': 'No forge task data exists under this project yet. Initialize the project with forge and its tasks appear here.',
  'tasks.noMatch.title': 'No matching tasks',
  'tasks.noMatch.body': 'No task matches the current search and filters.',
  'tasks.noMatch.clear': 'Clear filters',
  'tasks.loadError.title': 'Failed to load the task board',
  'tasks.loadError.retry': 'Retry',
  'tasks.column.key': 'Task',
  'tasks.column.title': 'Title',
  'tasks.column.status': 'Status',
  'tasks.column.feature': 'Feature',
  'tasks.column.branch': 'Branch',
  'tasks.column.worktree': 'Worktree',
  'tasks.column.source': 'Source',
  'tasks.column.updatedAt': 'Updated',
  'tasks.badge.worktree': 'worktree',
  'tasks.source.session': 'Session',
  'tasks.source.terminal': 'Terminal',
  'tasks.dangling': 'Dangling blocker',
  'tasks.dangling.title': 'Blocked by {keys}, which are not in the current task set',
  'tasks.select': 'Open task details',
  'tasks.group.ariaLabel': '{status} ({count} tasks)',
  'tasks.updated.announce': 'Task {key} updated',
  'tasks.status.pending': 'Pending',
  'tasks.status.in_progress': 'In progress',
  'tasks.status.completed': 'Completed',
  'tasks.status.blocked': 'Blocked',
  'tasks.status.suspended': 'Suspended',
  'tasks.status.skipped': 'Skipped',
  'tasks.status.rejected': 'Rejected',
  'tasks.status.short.pending': 'Pending',
  'tasks.status.short.in_progress': 'Active',
  'tasks.status.short.completed': 'Done',
  'tasks.status.short.blocked': 'Blocked',
  'tasks.status.short.suspended': 'Held',
  'tasks.status.short.skipped': 'Skipped',
  'tasks.status.short.rejected': 'Rejected',
}
