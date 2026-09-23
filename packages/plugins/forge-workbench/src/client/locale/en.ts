/**
 * The forge-workbench dictionary, English half — also the source of the
 * namespace's key union and the fallback copy (FALLBACK_LOCALE = 'en': any
 * locale missing a key resolves through the chain to these strings).
 */

/** Dictionary key union of the workbench namespace (LocaleNamespaceMap merge target). */
export type WorkbenchKey =
  | 'panel'
  | 'shell.title'
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
  | 'overview.toast.registered'
  | 'overview.toast.refreshed'
  | 'overview.toast.failed'
  | 'overview.toast.dismiss'
  | 'overview.plugins.title'
  | 'overview.plugins.loading'
  | 'overview.plugins.loadError.title'
  | 'overview.plugins.loadError.retry'
  | 'overview.plugins.emptyThirdParty'
  | 'overview.plugins.mandatoryBadge'
  | 'overview.plugins.status.enabled'
  | 'overview.plugins.status.disabled'
  | 'overview.plugins.thirdPartyHint'
  | 'overview.plugins.action.disable'
  | 'overview.plugins.action.enable'
  | 'overview.plugins.transitioning'
  | 'overview.plugins.confirm.title'
  | 'overview.plugins.confirm.impact'
  | 'overview.plugins.confirm.confirm'
  | 'overview.plugins.confirm.cancel'
  | 'overview.plugins.err.mandatory'
  | 'overview.plugins.err.runtimeState'
  | 'overview.plugins.err.generic'
  | 'overview.plugins.toast.dismiss'
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
  | 'wizard.step2.externalDefaultHint'
  | 'wizard.step2.defaultPathHint'
  | 'wizard.step3.title'
  | 'wizard.stepMigrate.title'
  | 'wizard.stepMigrate.intro'
  | 'wizard.stepMigrate.toggle'
  | 'wizard.stepMigrate.onHint'
  | 'wizard.stepMigrate.offHint'
  | 'wizard.summary.migrateNow'
  | 'wizard.summary.migrateDefer'
  | 'wizard.migration.enterWorkbench'
  | 'wizard.migration.finishUnmigrated'
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
  | 'tasks.tree.canvasLabel'
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
  | 'tasks.badge.sessionLive'
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
  | 'tasks.dispatch.entry'
  | 'tasks.dispatch.entry.disabledTooltip'
  | 'tasks.dispatch.detail'
  | 'tasks.dispatch.disabled.terminal'
  | 'tasks.dispatch.disabled.inProgress'
  | 'tasks.dispatch.disabled.suspended'
  | 'tasks.dispatch.disabled.deps'
  | 'tasks.dispatch.float.label'
  | 'tasks.dispatch.float.count'
  | 'tasks.dispatch.float.cancel'
  | 'tasks.dispatch.float.go'
  | 'tasks.dispatch.float.busy'
  | 'tasks.dispatch.warning.title'
  | 'tasks.dispatch.warning.listLabel'
  | 'tasks.dispatch.warning.intro'
  | 'tasks.dispatch.warning.note'
  | 'tasks.dispatch.warning.continue'
  | 'tasks.dispatch.warning.cancel'
  | 'tasks.dispatch.confirm.title'
  | 'tasks.dispatch.confirm.intro'
  | 'tasks.dispatch.confirm.presynth'
  | 'tasks.dispatch.confirm.go'
  | 'tasks.dispatch.confirm.cancel'
  | 'tasks.dispatch.error.timeoutTitle'
  | 'tasks.dispatch.error.failedTitle'
  | 'tasks.dispatch.error.timeoutBody'
  | 'tasks.dispatch.error.retry'
  | 'tasks.dispatch.error.close'
  | 'tasks.dispatch.announce.entered'
  | 'tasks.dispatch.announce.exited'
  | 'tasks.dispatch.announce.dispatched'
  | 'tasks.orch.starting'
  | 'tasks.orch.running'
  | 'tasks.orch.awaiting'
  | 'tasks.orch.failed'
  | 'tasks.orch.done'
  | 'tasks.orch.awaiting.aria'
  | 'tasks.orch.awaiting.tooltip'
  | 'tasks.orch.announce.task'
  | 'tasks.orch.announce.batch'
  | 'tasks.orch.announce.batchMixed'
  | 'tasks.orch.section'
  | 'tasks.orch.execute'
  | 'tasks.orch.execute.busy'
  | 'tasks.orch.execute.note'
  | 'tasks.orch.empty'
  | 'tasks.orch.currentState'
  | 'tasks.orch.dispatchedAt'
  | 'tasks.orch.session'
  | 'tasks.orch.failedReason'
  | 'tasks.orch.failedReason.none'
  | 'tasks.orch.redispatch'
  | 'tasks.orch.presynth'
  | 'tasks.orch.presynth.tooltip'
  | 'tasks.orch.presynth.hash'
  | 'tasks.orch.goApproval'
  | 'tasks.orch.announce.dispatched'
  | 'tasks.redispatch.title'
  | 'tasks.redispatch.reason'
  | 'tasks.redispatch.reason.none'
  | 'tasks.redispatch.note'
  | 'tasks.redispatch.go'
  | 'tasks.redispatch.cancel'
  | 'tasks.approval.toolbar'
  | 'tasks.approval.toolbar.aria'
  | 'tasks.approval.tabBadge.aria'
  | 'tasks.approval.title'
  | 'tasks.approval.note'
  | 'tasks.approval.close'
  | 'tasks.approval.loading'
  | 'tasks.approval.loadError.title'
  | 'tasks.approval.loadError.retry'
  | 'tasks.approval.empty'
  | 'tasks.approval.empty.hint'
  | 'tasks.approval.detail'
  | 'tasks.approval.expand'
  | 'tasks.approval.collapse'
  | 'tasks.approval.approve'
  | 'tasks.approval.reject'
  | 'tasks.approval.deciding'
  | 'tasks.approval.payload.unavailable'
  | 'tasks.approval.back'
  | 'tasks.approval.error.title'
  | 'tasks.approval.error.refreshed'
  | 'tasks.approval.announce.arrived'
  | 'tasks.approval.announce.approved'
  | 'tasks.approval.announce.rejected'
  | 'detail.close'
  | 'detail.loading'
  | 'detail.error.title'
  | 'detail.error.retry'
  | 'detail.section.description'
  | 'detail.section.depChain'
  | 'detail.section.records'
  | 'detail.section.links'
  | 'detail.description.empty'
  | 'detail.depChain.empty'
  | 'detail.depChain.self'
  | 'detail.records.empty'
  | 'detail.links.empty'
  | 'detail.links.active'
  | 'detail.links.ended'
  | 'detail.links.enter'
  | 'detail.launch.reserved'
  | 'features.loading'
  | 'features.loadError.title'
  | 'features.loadError.retry'
  | 'features.empty.title'
  | 'features.empty.body'
  | 'features.breadcrumb'
  | 'features.breadcrumb.root'
  | 'features.openDetail'
  | 'features.progress'
  | 'features.progressAria'
  | 'features.completedBadge'
  | 'features.externalDocs'
  | 'features.stepper.label'
  | 'features.notFound.title'
  | 'features.notFound.body'
  | 'features.notFound.back'
  | 'features.docs.tabsLabel'
  | 'features.docs.disabledHint'
  | 'features.docs.loading'
  | 'features.docs.error.title'
  | 'features.docs.error.retry'
  | 'features.docs.stale.title'
  | 'features.docs.stale.body'
  | 'features.docs.stale.retry'
  | 'features.docs.empty'
  | 'features.status.prd'
  | 'features.status.design'
  | 'features.status.tasks'
  | 'features.status.in-progress'
  | 'features.status.completed'
  | 'features.doc.manifest'
  | 'features.doc.prd'
  | 'features.doc.design'
  | 'features.doc.ui'
  | 'features.doc.tasks'
  | 'migration.pill.migratable'
  | 'migration.pill.migrated'
  | 'migration.entry.migrate'
  | 'migration.entry.guardTooltip'
  | 'migration.confirm.title'
  | 'migration.confirm.intro'
  | 'migration.confirm.bullet.tasks'
  | 'migration.confirm.bullet.backup'
  | 'migration.confirm.bullet.archive'
  | 'migration.confirm.bullet.md'
  | 'migration.confirm.backupLabel'
  | 'migration.confirm.migrate'
  | 'migration.confirm.cancel'
  | 'migration.step.verify'
  | 'migration.step.migrate'
  | 'migration.step.parity'
  | 'migration.step.backupDone'
  | 'migration.progress.title'
  | 'migration.result.parityOk'
  | 'migration.result.done'
  | 'migration.failed.title'
  | 'migration.failed.atStep'
  | 'migration.failed.rollbackNote'
  | 'migration.failed.retry'
  | 'migration.failed.close'
  | 'migration.live.running'
  | 'migration.err.guard'
  | 'migration.err.inProgress'
  | 'migration.err.generic'

/** English copy (the fallback locale). */
export const en: Record<WorkbenchKey, string> = {
  'panel': 'Workbench',
  'shell.title': 'forge workbench',
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
  'overview.toast.registered': 'Registered {name} — switch to it from the project switcher',
  'overview.toast.refreshed': 'Project list refreshed',
  'overview.toast.failed': 'Action failed: {message}',
  'overview.toast.dismiss': 'Dismiss',
  'overview.plugins.title': 'Plugins',
  'overview.plugins.loading': 'Loading plugins…',
  'overview.plugins.loadError.title': 'Failed to load plugins',
  'overview.plugins.loadError.retry': 'Retry',
  'overview.plugins.emptyThirdParty': 'No third-party plugins installed — only the required set is present.',
  'overview.plugins.mandatoryBadge': 'Required',
  'overview.plugins.status.enabled': 'Enabled',
  'overview.plugins.status.disabled': 'Disabled',
  'overview.plugins.thirdPartyHint': 'Third-party plugin · disabling only withdraws its injected content',
  'overview.plugins.action.disable': 'Disable',
  'overview.plugins.action.enable': 'Enable',
  'overview.plugins.transitioning': 'Updating plugin state…',
  'overview.plugins.confirm.title': 'Disable plugin',
  'overview.plugins.confirm.impact': "Only this plugin's injected content is withdrawn — forge data and the workbench's core capabilities are unaffected.",
  'overview.plugins.confirm.confirm': 'Disable',
  'overview.plugins.confirm.cancel': 'Cancel',
  'overview.plugins.err.mandatory': 'A required plugin cannot be disabled — it is part of the workbench core.',
  'overview.plugins.err.runtimeState': 'The plugin runtime state was invalid and has been rebuilt automatically.',
  'overview.plugins.err.generic': 'Action failed: {message}',
  'overview.plugins.toast.dismiss': 'Dismiss',
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
  'wizard.step2.inRepo': 'In repo',
  'wizard.step2.inRepoHint': 'Feature documents live inside the repository (docs/features).',
  'wizard.step2.external': 'Out of repo — app-managed (default)',
  'wizard.step2.externalDefaultHint': 'Feature documents stay outside the code repository, under the app-managed docs root.',
  'wizard.step2.defaultPathHint': 'App-managed location (prefilled; editable)',
  'wizard.step2.externalPlaceholder': 'Absolute path outside the code root',
  'wizard.step2.required': 'The external path is required.',
  'wizard.step2.checking': 'Checking the external path…',
  'wizard.step2.needAuthorize': 'Confirm the authorization to continue.',
  'wizard.step2.authorize': 'I authorize the workbench to read feature documents at this external path.',
  'wizard.step2.warn': 'External path: must differ from the code root, and requires explicit authorization.',
  'wizard.stepMigrate.title': 'Migration confirm',
  'wizard.stepMigrate.intro': 'tasks/index.json was detected in the project doc tree (the legacy task-state base). Migrate it to the app data kernel now?',
  'wizard.stepMigrate.toggle': 'Migrate to the M3 kernel after registering',
  'wizard.stepMigrate.onHint': 'Runs the one-time migration right after registration completes (recommended).',
  'wizard.stepMigrate.offHint': 'Off registers the project in the read-only compatibility state: the project card keeps its Migratable entry and migration can start later from the overview.',
  'wizard.summary.migrateNow': 'Migrate to the M3 kernel right after registering',
  'wizard.summary.migrateDefer': 'Defer migration (read-only compatibility; the card stays migratable)',
  'wizard.migration.enterWorkbench': 'Enter the workbench',
  'wizard.migration.finishUnmigrated': 'Finish registration unmigrated',
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
  'tasks.tree.canvasLabel': 'Task dependency graph',
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
  'tasks.badge.sessionLive': 'Session live',
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
  'tasks.dispatch.entry': 'Dispatch',
  'tasks.dispatch.entry.disabledTooltip': 'No dispatchable tasks (unmet dependencies or terminal)',
  'tasks.dispatch.detail': 'Open task details',
  'tasks.dispatch.disabled.terminal': 'Terminal task — reopen it before dispatching',
  'tasks.dispatch.disabled.inProgress': 'Task in progress (one executor per task)',
  'tasks.dispatch.disabled.suspended': 'Task suspended — resume it before dispatching',
  'tasks.dispatch.disabled.deps': 'Has unmet dependencies',
  'tasks.dispatch.float.label': 'Selection actions',
  'tasks.dispatch.float.count': '{count} selected',
  'tasks.dispatch.float.cancel': 'Cancel',
  'tasks.dispatch.float.go': 'Dispatch {count} →',
  'tasks.dispatch.float.busy': 'Dispatching…',
  'tasks.dispatch.warning.title': 'Stage artifacts incomplete',
  'tasks.dispatch.warning.listLabel': 'Missing artifacts',
  'tasks.dispatch.warning.intro': 'The deterministic pre-dispatch check (code-checked) found missing stage artifacts:',
  'tasks.dispatch.warning.note': 'The missing list is logged. This warning does not block dispatch — continue after confirming.',
  'tasks.dispatch.warning.continue': 'Continue dispatch',
  'tasks.dispatch.warning.cancel': 'Cancel',
  'tasks.dispatch.confirm.title': 'Confirm dispatch',
  'tasks.dispatch.confirm.intro': 'About to dispatch the following {count} task(s) (no dependency conflicts; parallel):',
  'tasks.dispatch.confirm.presynth': 'On dispatch the kernel pre-synthesizes the systemPrompt from three elements: task-type protocol + feature goal/summary + effective preferences; subagent start budget ≤3s.',
  'tasks.dispatch.confirm.go': 'Dispatch',
  'tasks.dispatch.confirm.cancel': 'Cancel',
  'tasks.dispatch.error.timeoutTitle': 'Dispatch timed out',
  'tasks.dispatch.error.failedTitle': 'Dispatch failed',
  'tasks.dispatch.error.timeoutBody': 'The dispatch budget expired (>3s): the subagent did not become interactive within budget.',
  'tasks.dispatch.error.retry': 'Retry',
  'tasks.dispatch.error.close': 'Close',
  'tasks.dispatch.announce.entered': 'Entered dispatch selection mode',
  'tasks.dispatch.announce.exited': 'Exited selection mode (selection cleared)',
  'tasks.dispatch.announce.dispatched': 'Dispatched {count} task(s)',
  'tasks.orch.starting': 'Pending',
  'tasks.orch.running': 'Running',
  'tasks.orch.awaiting': 'Awaiting approval',
  'tasks.orch.failed': 'Failed',
  'tasks.orch.done': 'Submitted',
  'tasks.orch.awaiting.aria': 'Task {key} awaiting approval — click to open approvals',
  'tasks.orch.awaiting.tooltip': 'Click to open approvals',
  'tasks.orch.announce.task': 'Task {key} entered {state}',
  'tasks.orch.announce.batch': '{count} tasks entered {state}',
  'tasks.orch.announce.batchMixed': '{count} task orchestration states updated',
  'tasks.orch.section': 'Orchestration',
  'tasks.orch.execute': 'Dispatch now',
  'tasks.orch.execute.busy': 'Dispatching…',
  'tasks.orch.execute.note': 'The M2 "Launch session" entry, evolved: presynthesized systemPrompt + subagent dispatch.',
  'tasks.orch.empty': 'Not dispatched yet (no orchestration record).',
  'tasks.orch.currentState': 'Current orchestration state',
  'tasks.orch.dispatchedAt': 'Dispatched {time}',
  'tasks.orch.session': 'subagent session {id}',
  'tasks.orch.failedReason': 'Failure reason: {reason}',
  'tasks.orch.failedReason.none': 'Failure reason: — (none recorded)',
  'tasks.orch.redispatch': 'Redispatch',
  'tasks.orch.presynth': 'Presynth: protocol ✓ · goal summary ✓ · preferences ✓',
  'tasks.orch.presynth.tooltip': 'Three elements: task-type protocol (template library) · feature goal/summary (latest stage asset) · effective preferences (three-tier resolution)',
  'tasks.orch.presynth.hash': 'prompt_hash {hash}',
  'tasks.orch.goApproval': 'Go to approvals',
  'tasks.orch.announce.dispatched': 'Task {key} dispatched',
  'tasks.redispatch.title': 'Redispatch confirmation',
  'tasks.redispatch.reason': 'Previous failure: {reason}',
  'tasks.redispatch.reason.none': 'Previous failure: — (none recorded)',
  'tasks.redispatch.note': 'Redispatch re-runs the artifact completeness check and the presynthesis.',
  'tasks.redispatch.go': 'Redispatch',
  'tasks.redispatch.cancel': 'Cancel',
  'tasks.approval.toolbar': 'Approvals {count}',
  'tasks.approval.toolbar.aria': 'Approvals: {count} awaiting',
  'tasks.approval.tabBadge.aria': '{count} awaiting approval',
  'tasks.approval.title': 'Awaiting approval ({count})',
  'tasks.approval.note': 'Approve / reject only via explicit click — no default auto-approval.',
  'tasks.approval.close': 'Close the approval panel',
  'tasks.approval.loading': 'Loading approvals…',
  'tasks.approval.loadError.title': 'Failed to load approvals',
  'tasks.approval.loadError.retry': 'Retry',
  'tasks.approval.empty': 'No approvals awaiting',
  'tasks.approval.empty.hint': 'New approval requests surface as badges and counts — never a modal.',
  'tasks.approval.detail': 'Details ↗',
  'tasks.approval.expand': 'Expand',
  'tasks.approval.collapse': 'Collapse',
  'tasks.approval.approve': 'Approve',
  'tasks.approval.reject': 'Reject',
  'tasks.approval.deciding': 'Submitting decision…',
  'tasks.approval.payload.unavailable': 'Request body unavailable',
  'tasks.approval.back': '◂ Back to approvals ({count})',
  'tasks.approval.error.title': 'Approval action failed',
  'tasks.approval.error.refreshed': 'The list has been refreshed.',
  'tasks.approval.announce.arrived': '{count} approval(s) awaiting',
  'tasks.approval.announce.approved': 'Task {key} approved — back to running',
  'tasks.approval.announce.rejected': 'Task {key} rejected — moved to failed',
  'detail.close': 'Close',
  'detail.loading': 'Loading task details…',
  'detail.error.title': 'Failed to load task details',
  'detail.error.retry': 'Retry',
  'detail.section.description': 'Description',
  'detail.section.depChain': 'Dependency chain',
  'detail.section.records': 'Execution records',
  'detail.section.links': 'Session history',
  'detail.description.empty': 'This task has no written description yet.',
  'detail.depChain.empty': 'No upstream blockers — this task is a root.',
  'detail.depChain.self': 'this task',
  'detail.records.empty': 'No execution records yet.',
  'detail.links.empty': 'No session has been attached to this task yet.',
  'detail.links.active': 'Active',
  'detail.links.ended': 'Ended',
  'detail.links.enter': 'Enter session',
  'detail.launch.reserved': 'The session launch entry arrives with task 5.11.',
  'features.loading': 'Loading features…',
  'features.loadError.title': 'Failed to load the feature board',
  'features.loadError.retry': 'Retry',
  'features.empty.title': 'No features',
  'features.empty.body': 'No forge feature data exists under this project yet. Initialize the project with forge and its features appear here.',
  'features.breadcrumb': 'Feature board breadcrumb',
  'features.breadcrumb.root': 'Feature board',
  'features.openDetail': 'Open feature {slug}',
  'features.progress': '{completed}/{total} tasks',
  'features.progressAria': 'Task progress: {completed} of {total} tasks completed',
  'features.completedBadge': 'All tasks completed',
  'features.externalDocs': 'External docs',
  'features.stepper.label': 'Feature status phases',
  'features.notFound.title': 'Feature not found',
  'features.notFound.body': 'This feature is not in the current board data — it may have been removed.',
  'features.notFound.back': 'Back to the feature board',
  'features.docs.tabsLabel': 'Feature documents',
  'features.docs.disabledHint': 'No document of this kind',
  'features.docs.loading': 'Loading document…',
  'features.docs.error.title': 'Failed to read the document',
  'features.docs.error.retry': 'Retry',
  'features.docs.stale.title': 'Snapshot is stale',
  'features.docs.stale.body': 'The snapshot no longer matches the forge files. A rescan is being triggered; retry in a moment.',
  'features.docs.stale.retry': 'Retry',
  'features.docs.empty': 'This document is empty.',
  'features.status.prd': 'prd',
  'features.status.design': 'design',
  'features.status.tasks': 'tasks',
  'features.status.in-progress': 'in-progress',
  'features.status.completed': 'completed',
  'features.doc.manifest': 'manifest',
  'features.doc.prd': 'prd',
  'features.doc.design': 'design',
  'features.doc.ui': 'ui',
  'features.doc.tasks': 'tasks',
  // The UF3 migration family (task 1.6): Pill/entry, confirm copy, step
  // rows, terminal results, guard notes — zh/en parity enforced by typing.
  'migration.pill.migratable': 'Migratable',
  'migration.pill.migrated': 'Migrated · SQLite',
  'migration.entry.migrate': 'Migrate',
  'migration.entry.guardTooltip': 'Task orchestration in progress — migration unlocks after it settles',
  'migration.confirm.title': 'Migrate to the M3 kernel',
  'migration.confirm.intro': 'A one-time migration is about to run:',
  'migration.confirm.bullet.tasks': 'Task structured state → the app data kernel (SQLite)',
  'migration.confirm.bullet.backup': 'Automatic backup before migrating; any failed phase rolls the whole run back (no half-migrated state)',
  'migration.confirm.bullet.archive': 'tasks/index.json retires after completion (kept on disk as a *.migrated archive)',
  'migration.confirm.bullet.md': 'Task and record .md files are untouched',
  'migration.confirm.backupLabel': 'Backup location',
  'migration.confirm.migrate': 'Migrate',
  'migration.confirm.cancel': 'Cancel',
  'migration.step.verify': 'Verify',
  'migration.step.migrate': 'Migrate',
  'migration.step.parity': 'Parity check',
  'migration.step.backupDone': 'Backup complete →',
  'migration.progress.title': 'Migrate to the M3 kernel',
  'migration.result.parityOk': 'Parity result: zero diff across the full task set',
  'migration.result.done': 'Done',
  'migration.failed.title': 'Migration failed · rolled back',
  'migration.failed.atStep': 'Failed at step "{step}"',
  'migration.failed.rollbackNote': 'Rolled back to the pre-migration state (backup kept; no half-migrated state).',
  'migration.failed.retry': 'Retry',
  'migration.failed.close': 'Close',
  'migration.live.running': 'Migration step in progress: {step}',
  'migration.err.guard': 'Task orchestration is in progress — migration and running orchestrations are mutually exclusive; start again after they settle.',
  'migration.err.inProgress': 'A migration is already running for this project; wait for it to settle and try again.',
  'migration.err.generic': 'The migration could not start ({code}); nothing has changed — try again.',
}
