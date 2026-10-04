// 相对时间标签（定位：基础——官方 relativeTime 桶化 → zh 文案的单一切换源，fix-36 收敛）。
// 此前 sidebar / knowledge / recall 三域模型各持一份逐字副本（「同级互禁」只禁同级业务
// 互引——公共下层共享不违铁律）；文案口径以本文件为唯一权威（P1 单语，多语归 M 系列主题化）。
import { relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * 毫秒时戳 → 官方桶化 zh 标签（纯函数）。桶枚举封闭——未知桶 fail-loud（契约面保证
 * relativeTime 返回封闭联合，default 支即不可达证明）。
 */
export function timeLabelZh(ts: number, now: number): string {
  const bucket = relativeTime(ts, now)
  switch (bucket.unit) {
    case 'now':
      return '刚刚'
    case 'minutes':
      return `${bucket.n} 分钟前`
    case 'hours':
      return `${bucket.n} 小时前`
    case 'days':
      return `${bucket.n} 天前`
    case 'months':
      return `${bucket.n} 个月前`
    case 'years':
      return `${bucket.n} 年前`
    default: {
      const exhaustive: never = bucket.unit
      throw new Error(`dsh-forge web: 未知相对时间桶：${String(exhaustive)}`)
    }
  }
}

/**
 * ISO-8601 串 → 桶化 zh 标签（纯函数）：不可解析原文返回（fail-soft 不炸卡片/行——
 * core 写入面保证 ISO，此为防御面）。
 */
export function isoTimeLabelZh(iso: string, now: number): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  return timeLabelZh(ts, now)
}
