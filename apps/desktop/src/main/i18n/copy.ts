// Shell copy dictionaries — Interface 7 of the M1 tech design.
//
// CopyKey is the full union of shell-facing strings (tray, notifications,
// update banner, crash recovery, fallback toasts). Both dictionaries must
// cover every key with no gaps (enforced by the Record<CopyKey, string>
// satisfies check and the snapshot tests in apps/desktop/tests/i18n.spec.ts).
//
// No third language is maintained in the shell (upstream language packs are
// out of scope for M1).

export type Locale = 'zh' | 'en'

export type CopyKey =
  | 'tray.show' | 'tray.quit'
  | 'notify.waitInput.title' | 'notify.waitInput.body'
  | 'notify.turnEnd.title' | 'notify.turnEnd.body'
  | 'update.viewRelease' | 'update.aria.close'
  | 'crash.title' | 'crash.restarting' | 'crash.restoring' | 'crash.recovered' | 'crash.failed'
  | 'toast.manualSwitch'       // 「请手动切换到会话 {title}」
  | 'toast.notifyDisabled'     // 「系统通知已禁用,可在系统设置中开启」(F3 权限被拒一次性提示)
  | 'window.view.board'        // detached 窗口标题的视图名(任务 4.2「<项目名> · <视图名>」)
  | 'window.view.conversation'
  | 'window.archivedSuffix'    // 归档项目的 detached 窗标题追加分(任务 4.3「标题追加『已归档』」)

export const zh: Record<CopyKey, string> = {
  'tray.show': '显示主窗口',
  'tray.quit': '退出 dsh-forge',
  'notify.waitInput.title': '等待输入',
  'notify.waitInput.body': '会话「{title}」等待你的输入',
  'notify.turnEnd.title': '回合完成',
  'notify.turnEnd.body': '会话「{title}」已完成本轮回复',
  'update.viewRelease': '查看更新',
  'update.aria.close': '关闭',
  'crash.title': '应用崩溃',
  'crash.restarting': '正在重启运行时…',
  'crash.restoring': '正在恢复会话…',
  'crash.recovered': '已恢复',
  'crash.failed': '恢复失败,请重启应用',
  'toast.manualSwitch': '请手动切换到会话 {title}',
  'toast.notifyDisabled': '系统通知已禁用,可在系统设置中开启',
  'window.view.board': '看板',
  'window.view.conversation': '会话',
  'window.archivedSuffix': '已归档',
}

export const en: Record<CopyKey, string> = {
  'tray.show': 'Show main window',
  'tray.quit': 'Quit dsh-forge',
  'notify.waitInput.title': 'Awaiting input',
  'notify.waitInput.body': 'Session "{title}" is awaiting your input',
  'notify.turnEnd.title': 'Turn completed',
  'notify.turnEnd.body': 'Session "{title}" has finished its turn',
  'update.viewRelease': 'View release notes',
  'update.aria.close': 'Close',
  'crash.title': 'Application crashed',
  'crash.restarting': 'Restarting the runtime…',
  'crash.restoring': 'Restoring your session…',
  'crash.recovered': 'Recovered',
  'crash.failed': 'Recovery failed — please restart the app',
  'toast.manualSwitch': 'Please switch to session {title} manually',
  'toast.notifyDisabled': 'System notifications are disabled; you can enable them in system settings',
  'window.view.board': 'Board',
  'window.view.conversation': 'Conversation',
  'window.archivedSuffix': 'Archived',
}

export const dictionaries: Record<Locale, Record<CopyKey, string>> = { zh, en }
