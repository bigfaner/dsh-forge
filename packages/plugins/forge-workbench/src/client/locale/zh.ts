/**
 * The forge-workbench dictionary, Chinese half. The typed locale registration
 * enforces bilingual balance (zh/en carry the identical key set); a locale
 * missing a key falls back through the chain to the English half.
 */
import type { WorkbenchKey } from './en'

/** Chinese copy. */
export const zh: Record<WorkbenchKey, string> = {
  'panel': '工作台',
  'shell.title': 'forge 工作台',
  'shell.placeholder': '工作台壳 — 任务看板、详情与 feature 视图由 M2 5.x 填充',
  'view.session': '会话',
  'rail.label': '主视图切换',
  'tabs.label': '工作台视图',
  'tab.overview': '概览',
  'tab.tasks': '任务',
  'tab.features': 'feature',
  'chrome.addProject': '添加项目',
  'switcher.label': '当前项目',
  'switcher.empty': '还没有项目',
  'switcher.emptyHint': '注册一个 forge 项目即可启用工作台。',
  'gate.title': '未激活项目',
  'gate.body': '任务与 feature 按项目组织,注册项目后即可查看。',
  'gate.register': '注册项目',
  'launch.entry': '发起会话',
  'launch.primary': '发起会话',
  'launch.probing': '正在检查任务执行 prompt…',
  'launch.reason.noPrompt': '该任务没有执行 prompt,无法从它发起会话。',
  'launch.reason.cliUnavailable': 'forge CLI 解析失败,请在设置中配置显式路径后重试。',
  'launch.confirm.title': '发起会话',
  'launch.confirm.task': '任务',
  'launch.confirm.cwd': '工作目录',
  'launch.confirm.explain': '将在项目工作目录下创建新的 dsh 会话,任务执行 prompt 将作为首条用户消息注入。',
  'launch.confirm.promptLabel': '执行 prompt(首条用户消息,只读)',
  'launch.confirm.expand': '展开完整 prompt',
  'launch.confirm.collapse': '收起 prompt',
  'launch.confirm.ok': '发起会话',
  'launch.confirm.cancel': '取消',
  'launch.initiating': '正在发起会话…',
  'launch.degraded.title': '手动发起',
  'launch.degraded.copied': '任务 prompt 已复制到剪贴板。',
  'launch.degraded.guide': '请切换到会话视图,粘贴为首条消息手动发起。',
  'launch.degraded.dismiss': '知道了',
  'launch.error.title': '发起失败',
  'launch.error.clipboard': '复制 prompt 到剪贴板失败,手动降级无法完成。',
  'launch.error.unexpected': '发起链意外失败。',
  'launch.error.retry': '重试',
  'launch.error.close': '关闭',
}
