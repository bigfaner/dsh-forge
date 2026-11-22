// convertDocument typed error 单源（validateMermaid 的 ValidateMermaidError 同构——
// code 承载、tool-error 语义；码闭集见提案 §二：INVALID_ARGS/UNSUPPORTED_VARIANT/
// CONVERT_ENGINE/IO）。分派/引擎/落盘全链唯一判别锚——壳与引擎层同引本类，
// 禁在别处另造错误形态。
export type ConvertToolErrorCode = 'ERR_INVALID_ARGS' | 'ERR_UNSUPPORTED_VARIANT' | 'ERR_CONVERT_ENGINE' | 'ERR_IO'

/** typed error（code 承载——tool-error 语义的判别锚） */
export class ConvertDocumentError extends Error {
  readonly code: ConvertToolErrorCode

  constructor(code: ConvertToolErrorCode, message: string) {
    super(message)
    this.name = 'ConvertDocumentError'
    this.code = code
  }
}

/** typed error 判别（结构面宽松自证——跨序列化附载后仍可识别） */
export function isConvertDocumentError(e: unknown): e is ConvertDocumentError {
  return (
    e instanceof ConvertDocumentError ||
    (typeof e === 'object' &&
      e !== null &&
      (e as { name?: unknown }).name === 'ConvertDocumentError' &&
      typeof (e as { code?: unknown }).code === 'string')
  )
}
