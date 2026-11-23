// docx 引擎适配器（定位：引擎——mammoth docx→markdown 归一 + 图片双策略）。
// 引擎选型核销：mammoth = docx→HTML/Markdown 纯 JS 生态事实标准（零外部二进制、
// Node 直用、维护活跃）；convertToMarkdown 为库内已知能力（html 中间态 md 归一
// 库内完成，无第二归一依赖）。图片策略：
//   assets（缺省）——mammoth images.imgElement 逐图回调，字节经注入 writeAsset 落
//     输出旁 assets/ 并改写引用为相对路径（非 base64、非 docx 内部路径）；
//   discard——同回调恒返空 src，转换后剥除空图引用（零图片落盘）。
import * as mammothModule from 'mammoth'
import { ConvertDocumentError, isConvertDocumentError } from './errors.js'

/** mammoth 最小消费面（结构化窄面——真实现结构兼容，库类型漂移不外溢） */
interface MammothImage {
  read(): Promise<Buffer>
  contentType?: string
}

interface MammothLike {
  convertToMarkdown(
    input: { buffer: Buffer },
    options?: {
      /** 图片转换缝（mammoth options.convertImage——imgElement 产物） */
      convertImage?: unknown
    },
  ): Promise<{ value: string; messages?: { message?: string }[] }>
  images: {
    imgElement(convert: (image: MammothImage) => Promise<{ src: string }>): unknown
  }
}

// CJS 互操作鲁棒形态：mammoth 为 CJS 包——esbuild bundle（esm）与 vite/ Node 直载的
// default 形态不同（bundle 态 default=module.exports、部分加载器 default 缺名）；
// namespace + default 兜底双态收敛，加载器差异不再外溢到消费面。
const mammothLike = ((mammothModule as { default?: unknown }).default ?? mammothModule) as unknown as MammothLike

/** content-type → 图片扩展名（assets 命名面；未知类型归 .png 兜底——mammoth 侧原样字节） */
function extOfContentType(contentType: string | undefined): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
    'image/x-emf': 'emf',
    'image/x-wmf': 'wmf',
  }
  const ext = contentType === undefined ? undefined : map[contentType.split(';')[0]!.trim().toLowerCase()]
  return ext ?? 'png'
}

/** 图片策略（assets = 抽取输出旁 assets/ 改写引用（缺省）；discard = 零落盘） */
export type ConvertImageStrategy = 'assets' | 'discard'

export interface DocxConvertOptions {
  readonly images: ConvertImageStrategy
  /** assets 策略的图片落盘缝（注入点——单测替身 / 落盘边界单点）：返回 md 内引用 src */
  readonly writeAsset?: (bytes: Buffer, ext: string) => string
}

export interface DocxConvertOutcome {
  readonly markdown: string
  /** 本档内处理的图片总数（assets = 抽取数 / discard = 丢弃数） */
  readonly imagesHandled: number
}

/** docx buffer → markdown（typed error：引擎异常 → ERR_CONVERT_ENGINE，不裸抛） */
export async function convertDocxToMarkdown(buffer: Buffer, options: DocxConvertOptions): Promise<DocxConvertOutcome> {
  let imagesHandled = 0
  const imgElement = mammothLike.images.imgElement(async (image) => {
    imagesHandled += 1
    if (options.images === 'discard') return { src: '' }
    const src = options.writeAsset ? options.writeAsset(await image.read(), extOfContentType(image.contentType)) : ''
    return { src }
  })
  let result: { value: string }
  try {
    result = await mammothLike.convertToMarkdown({ buffer }, { convertImage: imgElement })
  } catch (e) {
    if (isConvertDocumentError(e)) throw e
    throw new ConvertDocumentError(
      'ERR_CONVERT_ENGINE',
      `convertDocument: docx engine failed: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  let markdown = result.value
  // assets 引用归一：mammoth markdown 出面对 URL 内标点做反斜杠转义（assets/image\-1\.png）
  // ——引用路径去转义还原为可解析相对路径（assets/image-1.png）。
  markdown = markdown.replace(/(!\[[^\]]*\]\()((?:[^()\\]|\\.)+)\)/g, (_m, head: string, url: string) => {
    return `${head}${url.replace(/\\([.\\\-()#[\]!_*{}>+"'])/g, '$1')})`
  })
  if (options.images === 'discard') {
    // 丢弃策略：剥除空图引用（src 恒空产物），零图片痕迹零落盘
    markdown = markdown.replace(/!\[[^\]]*\]\(\s*\)/g, '')
  }
  return { markdown, imagesHandled }
}
