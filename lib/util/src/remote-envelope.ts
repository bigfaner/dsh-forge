// remote-envelope —— 官方 Typert remote 应答信封解包（跨插件单源——client 半消费点族）：
// 官方 remote 方法应答 = RemoteResult 判别联合 `{ok:true, value:T} | {ok:false, error}`，
// client 半逐点消费时必须解包（先例族：expert-squad model-catalog 判例 + config-jump
// listBundles 判例（第二消费点复发实证——误读裸数组 = 空清单静默降级）；project/task-loop
// rpc.ts 为完整传输层自持投影，不属本件消费面）。浏览器安全（纯判别窄化——零 node 依赖，
// client bundle esbuild 内联）。

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * 信封解包：`{ok:true, value}` → value；非信封/`ok:false`/畸形 = undefined。
 * 裸值透传不承担（调用方传错形状 = undefined——fail-soft 归调用方兜底语义）。
 */
export function remoteValueOf(envelope: unknown): unknown {
  const record = asRecord(envelope);
  return record !== undefined && record["ok"] === true ? record["value"] : undefined;
}
