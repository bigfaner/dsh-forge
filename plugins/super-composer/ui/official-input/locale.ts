// locale —— 替身 InputBar 复制件的 conversation 命名空间词典（消费键子集）。
// PROVENANCE：文案取自官方 ui-conversation/src/client/locales.ts zh 词典
//（0.2.0-rc.2，repo f059f01ce367748392d8f665c0705fb4302a626b）逐键同文；插值
// {param} 形状同官方。升级 re-copy 时对照官方词典同步。

/** 复制件消费的词典键 → 官方 zh 同文（含插值模板）。 */
const ZH: Record<string, string> = {
  'hint.plan': '描述你的任务以生成计划',
  'hint.goal': '输入目标，智能体将持续执行',
  'hint.goal.active': '当前目标进行中。可输入 edit 修改 / pause 暂停 / resume 继续 / clear 清除',
  'placeholder.plan': '描述你的任务以生成计划',
  'placeholder.default': '发消息或创建任务, / 调用指令, @ 文件或对话',
  'placeholder.unavailable': '会话不可用',
  'placeholder.parentOffline': '父会话已离线，无法继续发送；仍可停止当前运行',
  'placeholder.steerQueue': 'Cmd/Ctrl+Enter 插话发送全部排队消息',
  'input.commands': '添加文件或调用指令',
  'input.stop': '停止生成',
  'input.send': '发送消息',
  'input.send.queue': '排队发送',
  'input.send.steer': '插话发送',
  'hero.chooseWorkspace': '选择工作区',
  'error.sessionInUse':
    '当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。',
  'image.tooMany': '一条消息最多添加 {count} 张图片',
  'image.fileTooLarge': '单张图片不能超过 {size}',
  'image.totalTooLarge': '图片总大小超过 {size}，请移除部分图片',
  'file.stillUploading': '文件还在上传，请等待上传完成后发送',
  'context.aria': '上下文已用 {percent}',
  'context.used': '上下文已用',
  'context.system': '系统提示词',
  'context.tools': '工具定义',
  'context.messages': '对话消息',
  'number.thousand': '{value}K',
  'number.million': '{value}M',
}

/** 官方 Translate 同形：{param} 插值替换；缺键回显 key（与官方词典 miss 行为同形）。 */
export function surrogateTranslate(key: string, params?: Record<string, unknown>): string {
  const template = ZH[key]
  if (template === undefined || params === undefined) return template ?? key
  return template.replace(/\{(\w+)\}/g, (raw, name: string) => {
    const value = params[name]
    return value === undefined ? raw : String(value)
  })
}
