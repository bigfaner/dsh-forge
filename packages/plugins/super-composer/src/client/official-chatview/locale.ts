// locale —— official-chatview 复制件消费的 chat/conversation/locale 词典消费子集。
// PROVENANCE：文案取自官方
//   - packages/client/locale/src/locales/zh.ts（copy/copied/codeBlock.*/markdown.footnotes/
//     workspace.defaultName）
//   - packages/client/ui-chat/src/client/locale.ts zh 词典（message.*/clock.*/duration.*/row.running/
//     json.truncated）
//   - packages/client/ui-conversation/src/client/locales.ts zh 词典（placeholder.*/hero.chooseWorkspace）
// （0.2.0-rc.2，repo f059f01ce367748392d8f665c0705fb4302a626b）逐键同文；插值 {param}
// 形状同官方。升级 re-copy 时对照官方词典同步。

/** 复制件消费的词典键 → 官方 zh 同文（含插值模板）。 */
const ZH: Record<string, string> = {
  // packages/client/locale/src/locales/zh.ts
  'copy': '复制',
  'copied': '复制成功',
  'codeBlock.title': '代码块',
  'codeBlock.wrap': '自动换行',
  'codeBlock.unwrap': '取消自动换行',
  'markdown.footnotes': '脚注',
  'workspace.defaultName': '默认工作区',
  // ui-conversation locales.ts zh
  'placeholder.workspace': '选择一个工作区开始',
  'placeholder.hero': '描述你想要构建的内容, / 调用指令, @ 文件或对话',
  'hero.chooseWorkspace': '选择工作区',
  // ui-chat locale.ts zh
  'message.referenceSummary': '引用会话 · {labels}',
  'message.referenceSeparator': '、',
  'message.extraBlock': '附加内容块',
  'message.think': '思考',
  'message.unknownSurface': '未知 surface 事件：{type}',
  'message.unknownBlock': '未知内容块',
  'message.stopped': '已停止',
  'row.running': '运行中',
  'json.truncated': '… 已截断，共 {total} 字符',
  'clock.md': '{m}月{d}日',
  'clock.ymd': '{y}年{m}月{d}日',
  'duration.milliseconds': '{milliseconds}毫秒',
  'duration.secondUnit': '秒',
  'duration.minuteUnit': '分',
  'duration.hourUnit': '小时',
}

/** 官方 Translate 同形：{param} 插值替换；缺键回显 key（与官方词典 miss 行为同形）。 */
export function chatviewTranslate(key: string, params?: Record<string, unknown>): string {
  const template = ZH[key]
  if (template === undefined || params === undefined) return template ?? key
  return template.replace(/\{(\w+)\}/g, (raw, name: string) => {
    const value = params[name]
    return value === undefined ? raw : String(value)
  })
}
