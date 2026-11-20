// PROVENANCE: 官方 dsh-client-ui-conversation@0.2.2-rc.5 src/client/service.ts 的结构同型镜像（对照 deepseek-harness 2c990f0b14fbe870cd6a083c1708b35fd22a7172，2026-11 任务 1.4）。官方 service.ts 整模块不入复制件（ConversationController 域面替身不可达）；rc.5 InputBar 消费 isImageMediaType 单函数，逐字镜像（官方源 service.ts:642-644）。

/**
 * Whether a browser-declared MIME selects the image draft path (all other files upload verbatim).
 * @param value - the browser's declared MIME type.
 * @returns whether the file is an accepted raster image.
 */
export function isImageMediaType(value: string): boolean {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}
