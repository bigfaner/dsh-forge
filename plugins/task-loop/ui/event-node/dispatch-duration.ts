// 1.41 自 DispatchEventsPanel 抽出随迁——ForgeEventEntries 消费；壳侧本体留壳（C 类）。
/** 耗时标签（start→end 毫秒段——zh 紧凑两段档：秒/分/时/天） */
export function dispatchEventDurationLabel(startMs: number, endMs: number): string {
  const total = Math.max(0, Math.floor((endMs - startMs) / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
}
