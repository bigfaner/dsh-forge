/**
 * Translate 面镜像（official-input 复制件本地支撑面）�? * PROVENANCE：官方源�?@deepseek-ai/dsh-client-ui-slots �?Translate——复制件不引�? * 该包依赖，按消费面结构同型承载（key �?文案，可选插值参数；InputBar �?hint 动�? * 键查找用�?key 签名承载）。官方版本锚�?.2.0-rc.2
 *（repo f059f01ce367748392d8f665c0705fb4302a626b�?026-10-22）�? */
export type Translate<K extends string = string> = (key: K, params?: Record<string, unknown>) => string
