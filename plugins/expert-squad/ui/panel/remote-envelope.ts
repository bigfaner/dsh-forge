// remote-envelope —— 客户端本地信封解包（lib/util remote-envelope 逐字内联镜像——
// client bundle 零 node 依赖）：lib-util 主入口含 node:fs/crypto/path 面，esbuild
// browser 构建不可达，故 client 半消费点取本地纯函数副本（判别窄化零 node 依赖，
// 与单源正本逐字等价仅落位迁移——禁改行为）。

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
