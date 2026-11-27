// convert_document 分派与落盘边界单源（定位：业务——docx/pdf 机械分派 + 路径穿越
// 守卫 + fs 缝 + 图片策略落盘）。壳（tools/convert-document.ts）只做 schema 收窄与
// 路由，零业务逻辑；本文件承担提案 §二全部工具面语义：
//   - 分派：format auto = 按扩展名机械分派（.docx → docx 引擎 / .pdf → pdf 引擎），
//     不经 LLM；显式 format 覆盖扩展名。
//   - 不支持变体：未知扩展与 .doc 老格式 → ERR_UNSUPPORTED_VARIANT（pdf 扫描件在
//     pdf 引擎内以零文本判据同码拒绝）。
//   - 落盘边界：session.cwd 锚（cwd 由壳从会话上下文解析后传入）+ 注入 fs 缝 +
//     穿越守卫（绝对路径 / `..` 段 / 解析后越界一律 ERR_IO，拒绝先于任何 IO）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { assertRelUnderRoot as assertWorkspaceRelPath, isRelPathError } from '../tools/workspace.js'
import { ConvertDocumentError, isConvertDocumentError } from './errors.js'
import { convertDocxToMarkdown, type ConvertImageStrategy } from './docx.js'
import { convertPdfToMarkdown } from './pdf.js'

/** 注入 fs 缝（knowledge 注入缝同构——缺省 node:fs 同步面，单测替身替换） */
export interface ConvertFsSeam {
  readFile(absPath: string): Buffer
  writeFile(absPath: string, data: string | Buffer): void
  mkdir(dirPath: string, options?: { recursive?: boolean }): void
}

export const defaultConvertFs: ConvertFsSeam = {
  readFile: (absPath) => readFileSync(absPath),
  writeFile: (absPath, data) => writeFileSync(absPath, data),
  mkdir: (dirPath, options) => mkdirSync(dirPath, options),
}

export interface ConvertDocumentInput {
  readonly docRel: string
  readonly outRel?: string
  readonly images?: ConvertImageStrategy
  readonly format?: 'auto' | 'docx' | 'pdf'
}

export interface ConvertDocumentDeps {
  /** session.cwd 锚（壳从会话上下文解析——落盘/读取一切相对路径的唯一根） */
  readonly cwd: string
  readonly fs?: ConvertFsSeam
}

/** 成功摘要（schema/契约 CD-1..CD-3 锚面——可选键在壳层剔除 undefined 后返回） */
export interface ConvertDocumentSummary {
  readonly ok: true
  readonly outRel: string
  readonly engine: 'docx' | 'pdf'
  /** assets 策略抽取图片数（pdf/docx discard 缺键） */
  readonly extractedImages?: number
  /** discard 策略丢弃图片数（其余缺键） */
  readonly discardedImages?: number
  /** pdf 页数（docx 缺键） */
  readonly pages?: number
}

/**
 * 路径穿越守卫（拒绝先于任何 IO——CD-5 可红锚）：守卫逻辑单源在
 * tools/workspace.ts assertRelUnderRoot（F-2 DRY 收口——三 tool 同源），此处仅
 * RelPathError → ConvertDocumentError(ERR_IO) 转译；合法相对路径返回 workspace
 * 根下解析绝对路径。
 */
export function assertRelUnderRoot(rootAbs: string, rel: string, field: string): string {
  try {
    return assertWorkspaceRelPath(rootAbs, rel, { tool: 'convert_document', field })
  } catch (e) {
    if (isRelPathError(e)) throw new ConvertDocumentError('ERR_IO', e.message)
    throw e
  }
}

/** 扩展名 → 引擎机械分派表（auto 口径——不经 LLM） */
function engineForExtension(docRel: string): 'docx' | 'pdf' | undefined {
  const ext = extname(docRel).toLowerCase()
  if (ext === '.docx') return 'docx'
  if (ext === '.pdf') return 'pdf'
  return undefined
}

/** 缺省输出路径：同目录同名 .md（无扩展名时追加） */
export function defaultOutRelOf(docRel: string): string {
  const ext = extname(docRel)
  return ext === '' ? `${docRel}.md` : `${docRel.slice(0, docRel.length - ext.length)}.md`
}

/**
 * convert_document 业务单源执行体：分派 → 引擎转换（图片策略）→ 落盘 → 成功摘要。
 * 全部失败路径 typed error（拒绝先于 IO——失败零落盘）。
 */
export async function convertDocumentWorkspaceFile(input: ConvertDocumentInput, deps: ConvertDocumentDeps): Promise<ConvertDocumentSummary> {
  const fs = deps.fs ?? defaultConvertFs
  const tool = 'convert_document'
  const rootAbs = resolve(deps.cwd)
  const srcAbs = assertRelUnderRoot(rootAbs, input.docRel, 'docRel')

  const format = input.format ?? 'auto'
  const engine = format === 'auto' ? engineForExtension(input.docRel) : format
  if (engine === undefined) {
    throw new ConvertDocumentError(
      'ERR_UNSUPPORTED_VARIANT',
      `${tool}: unsupported document variant "${input.docRel}" — supported: .docx / .pdf (legacy .doc and scanned pdfs are rejected)`,
    )
  }

  const outRel = input.outRel ?? defaultOutRelOf(input.docRel)
  const outAbs = assertRelUnderRoot(rootAbs, outRel, 'outRel')
  const outDirAbs = dirname(outAbs)

  let buffer: Buffer
  try {
    buffer = fs.readFile(srcAbs)
  } catch (e) {
    if (isConvertDocumentError(e)) throw e
    const errno = (e as NodeJS.ErrnoException).code
    throw new ConvertDocumentError(
      'ERR_IO',
      `${tool}: cannot read source document: ${input.docRel} — not found or not readable (check the path relative to the workspace root${errno !== undefined ? `; errno ${errno}` : ''})`,
    )
  }

  try {
    if (engine === 'docx') {
      const strategy: ConvertImageStrategy = input.images ?? 'assets'
      const usedAssetNames = new Set<string>()
      const outcome = await convertDocxToMarkdown(buffer, {
        images: strategy,
        writeAsset:
          strategy === 'assets'
            ? (bytes, ext) => {
                let index = 1
                let name = `image-${index}.${ext}`
                while (usedAssetNames.has(name)) {
                  index += 1
                  name = `image-${index}.${ext}`
                }
                usedAssetNames.add(name)
                const assetDirAbs = join(outDirAbs, 'assets')
                fs.mkdir(assetDirAbs, { recursive: true })
                fs.writeFile(join(assetDirAbs, name), bytes)
                return `assets/${name}`
              }
            : undefined,
      })
      try {
        fs.mkdir(outDirAbs, { recursive: true })
        fs.writeFile(outAbs, outcome.markdown)
      } catch (e) {
        throw new ConvertDocumentError('ERR_IO', `${tool}: cannot write output: ${outRel} — ${e instanceof Error ? e.message : String(e)}`)
      }
      return {
        ok: true,
        outRel,
        engine,
        ...(strategy === 'assets' ? { extractedImages: outcome.imagesHandled } : { discardedImages: outcome.imagesHandled }),
      }
    }

    const outcome = await convertPdfToMarkdown(buffer)
    try {
      fs.mkdir(outDirAbs, { recursive: true })
      fs.writeFile(outAbs, outcome.markdown)
    } catch (e) {
      throw new ConvertDocumentError('ERR_IO', `${tool}: cannot write output: ${outRel} — ${e instanceof Error ? e.message : String(e)}`)
    }
    return { ok: true, outRel, engine, pages: outcome.pages }
  } catch (e) {
    // 引擎层已 typed；此处兜底归一剩余意外（引擎崩溃不裸抛——tool-error 单点承载）
    if (isConvertDocumentError(e)) throw e
    throw new ConvertDocumentError('ERR_CONVERT_ENGINE', `${tool}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
