// 根 ctx 取法（bug bf4f3851 / 2801eeeb 同族——vendor cordis 1.1.0 起 ctx 属性访问按
// 服务名走 inject 门：`ctx.root` 属性取法即抛 "cannot get property root without
// inject"）。官方正规取法 = 全局注册符号键（vendor cordis symbols.root =
// Symbol.for("cordis.root") 同值——isSpecialProperty 符号直通，且跨代际/跨模块副本
// 符号同一性成立，零 cordis 运行期 import）。
export const CORDIS_ROOT = /* @__PURE__ */ Symbol.for("cordis.root");

/** 根 ctx 取法：ctx 形入参返回树根，非 ctx 形入参（纯 face 对象）原样返回。 */
export function rootCtxOf(ctxLike: unknown): unknown {
  return (ctxLike as Record<PropertyKey, unknown>)[CORDIS_ROOT] ?? ctxLike;
}
