// workbench/knowledge/frontmatter — YAML frontmatter 切分/解析/序列化(任务 2.2)。
//
// 移植基准 = forge-cli `pkg/infocmd/infocmd.go` ExtractFrontmatter(Go 权威
// 方言:起始 `---` + 紧随换行,闭合 `\n---`,EOF 收尾特例)—— 逐行为对齐:
//   - 非 `---` 开头 / 无闭合界 → 无 frontmatter(正文原样),非错误;
//   - YAML 体解析用 `yaml` 包(与 Go gopkg.in/yaml.v3 同覆盖面:flow 数组
//     `[a, b]` 与块列表均支持 —— 知识系 frontmatter 的 tags/dimensions/
//     candidates 依赖此面;indexer/parse-task.ts 的标量方言解析器不覆盖
//     数组,故本模块独立,不复用)。
//
// 写路径(lesson/research add)经 stringifyFrontmatter 产出 forge 同型文件:
// `---\n<yaml>\n---\n\n<body>`(quote 规则交给 yaml 序列化器,dates 以
// 字符串入参,不做日期语义)。

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/** 切分产物:raw = frontmatter YAML 原文(null = 无 frontmatter);body = 余文。 */
export interface SplitFrontmatter {
  readonly raw: string | null
  readonly body: string
}

/**
 * Go ExtractFrontmatter 的逐行为移植。EOF 收尾特例(Go:无 `\n---` 闭合但
 * TrimSpace 后以 `---` 结束)保留 —— 末行缺换行的文件同样切出 frontmatter。
 */
export function splitFrontmatter(text: string): SplitFrontmatter {
  if (!text.startsWith('---')) return { raw: null, body: text }
  let rest = text.slice(3)
  // 起始界后必须紧跟换行或 EOF(Go:len(text)>0 && text[0] != '\n' → 无 fm)。
  if (rest.length > 0 && !rest.startsWith('\n')) return { raw: null, body: text }
  if (rest.startsWith('\n')) rest = rest.slice(1)

  const closeIdx = rest.indexOf('\n---')
  if (closeIdx === -1) {
    // EOF 特例:整个余文以 --- 收尾(允许尾随空白)→ frontmatter = 去尾文本。
    const trimmed = rest.trimEnd()
    if (trimmed.endsWith('---')) {
      return { raw: trimmed.slice(0, -3).trim(), body: '' }
    }
    return { raw: null, body: text }
  }
  return { raw: rest.slice(0, closeIdx), body: rest.slice(closeIdx + 4) }
}

/**
 * frontmatter → 对象。无 frontmatter / YAML 损坏 → null(Go Discover 语义:
 * 解析失败条目跳过,不炸整目录扫描;调用方决定跳过或报错)。
 * 标量/数组/嵌套均按 yaml 通用形态返回(调用方按需收窄读取)。
 */
export function parseFrontmatterObject(text: string): Record<string, unknown> | null {
  const { raw } = splitFrontmatter(text)
  if (raw === null) return null
  try {
    const parsed = parseYaml(raw)
    if (parsed === null || parsed === undefined) return null
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** 字段读取面(frontmatter 对象 → 收窄类型;缺失/类型不合 → 缺省)。 */
export function readStringField(fields: Record<string, unknown>, key: string): string {
  const value = fields[key]
  return typeof value === 'string' ? value : ''
}

/** Go yaml `tags: [a, b]` / 块列表 → string[](标量与异构成员忽略)。 */
export function readStringArrayField(fields: Record<string, unknown>, key: string): string[] {
  const value = fields[key]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * 写路径序列化:`---\n<yaml>\n---\n\n<body>`。键序 = 插入序(forge 写出的
 * 字段序:create/topic/mode/…),保持与仓侧文件形态同型。
 */
export function stringifyFrontmatter(fields: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(fields).trimEnd()
  const trimmedBody = body.trim()
  return `---\n${yaml}\n---\n${trimmedBody === '' ? '' : `\n${trimmedBody}\n`}`
}
