// pdf 引擎适配器（定位：引擎——pdfjs 系文本提取）。
// pdfjs 选型核销清单（提案 §二——维护活跃 / ESM 兼容 / Node 无 canvas 强依赖）：
//   - 选定 pdfjs-dist 4.10.38（Mozilla 官方维护、registry ESM：legacy/build/pdf.mjs
//     Node 直用形态）；4.x 线 engines node>=20 与宿主基线一致（5.x/6.x 起 engines
//     node>=22.13，超宿主基线——不取）。
//   - 文本提取（getTextContent）不需要 canvas——canvas 仅为页面渲染强依赖；
//     legacy build 在 Node 无 worker/无 DOM 环境走 fake worker 路径。
//   - 扫描件判据 = 全文档零可提取文本（zero-text 恒真判据）——OCR 范围外，
//     显式 ERR_UNSUPPORTED_VARIANT 拒绝。
import { ConvertDocumentError, isConvertDocumentError } from './errors.js'

/** pdfjs 最小消费面（结构化窄面——库类型不外溢，模块面以运行期动态 import 锚定） */
interface PdfTextItem {
  readonly str?: string
  readonly hasEOL?: boolean
}

interface PdfPage {
  getTextContent(): Promise<{ items: readonly PdfTextItem[] }>
}

interface PdfDocument {
  readonly numPages: number
  getPage(n: number): Promise<PdfPage>
  destroy(): Promise<void>
}

interface PdfjsModule {
  getDocument(src: {
    data: Uint8Array
    useWorkerFetch: boolean
    isEvalSupported: boolean
    disableFontFace: boolean
  }): { promise: Promise<PdfDocument> }
}

// pdfjs legacy build 入口（pdfjs-dist/legacy 固定子路径；字面量说明符动态 import
// ——esbuild bundle 期全内联进 dist，零 registry 解析径——零运行时依赖终态）。

export interface PdfConvertOutcome {
  readonly markdown: string
  readonly pages: number
}

/** pdf buffer → 文本 markdown（typed error：引擎异常 ERR_CONVERT_ENGINE / 扫描件 ERR_UNSUPPORTED_VARIANT） */
export async function convertPdfToMarkdown(buffer: Buffer): Promise<PdfConvertOutcome> {
  let doc: PdfDocument
  try {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise
  } catch (e) {
    if (isConvertDocumentError(e)) throw e
    throw new ConvertDocumentError(
      'ERR_CONVERT_ENGINE',
      `convertDocument: pdf engine failed: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  const pages = doc.numPages
  try {
    const pageTexts: string[] = []
    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content.items) {
        pageText += (typeof item.str === 'string' ? item.str : '') + (item.hasEOL === true ? '\n' : '')
      }
      const trimmed = pageText.trim()
      if (trimmed !== '') pageTexts.push(trimmed)
    }
    await doc.destroy()
    if (pageTexts.length === 0) {
      throw new ConvertDocumentError(
        'ERR_UNSUPPORTED_VARIANT',
        `convertDocument: pdf contains no extractable text across ${pages} page(s) — likely a scanned document; scanned pdfs are unsupported (no OCR)`,
      )
    }
    return { markdown: `${pageTexts.join('\n\n')}\n`, pages }
  } catch (e) {
    if (isConvertDocumentError(e)) throw e
    throw new ConvertDocumentError(
      'ERR_CONVERT_ENGINE',
      `convertDocument: pdf engine failed: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}
