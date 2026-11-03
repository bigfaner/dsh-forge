/**
 * Translate 面镜像（official-input 复制件本地支撑面）。
 * PROVENANCE：官方源 = @deepseek-ai/dsh-client-ui-slots 的 Translate——复制件不引
 * 入该包依赖，按消费面结构同型承载（key → 文案，可选插值参数；InputBar 的 hint
 * 动态键查找用该 key 签名承载）。官方版本锚 0.2.0-rc.2
 *（repo f059f01ce367748392d8f665c0705fb4302a626b，2026-10-22）。
 */
export type Translate<K extends string = string> = (key: K, params?: Record<string, unknown>) => string
