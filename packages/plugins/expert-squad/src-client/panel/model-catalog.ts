// panel/model-catalog —— 「设置>模型」目录读缝（provider/model 选项值源）：
// 惰性 ctx.reflect.get('remote.session')（'remote' 嵌套双径）→ modelCatalog() 解信封
// → [{provider, models}]。apps/web client-plugin m3.1 D25 同径先例（ForgeSettingsSection
// Provider/Model 下拉同源）——缺席/调用拒绝/信封失败 = undefined，组件面回退纯文本输入
// 语义（FilterSelect box 显当前值），不炸 Dialog。

/** 目录条目（官方 ModelCatalog groups 切片——bundle 自持禁跨包 import）。 */
export interface ModelCatalogEntry {
  /** provider 路由 id（官方模型选择器同源口径——档案 provider 字段同值域）。 */
  readonly provider: string;
  /** 该 provider 下的模型 id 清单（adapter-preferred order）。 */
  readonly models: readonly string[];
}

/** 目录装载器（装配壳 inject face 递达；测试注入）。 */
export type ModelCatalogLoader = () => Promise<readonly ModelCatalogEntry[] | undefined>;

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * RemoteResult 信封解包：`{ok:true, value:{groups:[{id, models:[{id}]}]}}`
 * → `[{provider, models}]`；他形（!ok / 缺 groups）= undefined。
 */
export function modelCatalogOfEnvelope(envelope: unknown): readonly ModelCatalogEntry[] | undefined {
  const result = asRecord(envelope);
  if (result === undefined || result["ok"] !== true) return undefined;
  const groups = asRecord(result["value"])?.["groups"];
  if (!Array.isArray(groups)) return undefined;
  const entries: ModelCatalogEntry[] = [];
  for (const group of groups) {
    const record = asRecord(group);
    const provider = record?.["id"];
    if (typeof provider !== "string" || provider === "") continue;
    const models: string[] = [];
    if (Array.isArray(record?.["models"])) {
      for (const model of record["models"]) {
        const id = asRecord(model)?.["id"];
        if (typeof id === "string" && id !== "") models.push(id);
      }
    }
    entries.push({ provider, models });
  }
  return entries;
}

/** 惰性服务读取（reflect.get——缺席/异常 = undefined fail-soft；召唤缝同径）。 */
function reflectGet(ctx: { reflect?: { get(name: string): unknown } }, name: string): unknown {
  try {
    return ctx.reflect?.get(name);
  } catch {
    return undefined;
  }
}

/** remote.session 官方面消费切片（'remote' 嵌套双径——plugin.ts model catalog 同径）。 */
function sessionServiceOf(ctx: { reflect?: { get(name: string): unknown } }): Record<string, unknown> | undefined {
  return (
    asRecord(reflectGet(ctx, "remote.session")) ??
    asRecord(asRecord(reflectGet(ctx, "remote"))?.["session"])
  );
}

/**
 * 目录装载器装配（调用期惰性解析——服务缺席/形状漂移/调用拒绝 = resolve(undefined)）。
 */
export function modelCatalogLoaderOf(ctx: {
  reflect?: { get(name: string): unknown };
}): ModelCatalogLoader {
  return () => {
    const sessionSvc = sessionServiceOf(ctx);
    const modelCatalog = sessionSvc?.["modelCatalog"] as (() => Promise<unknown>) | undefined;
    if (typeof modelCatalog !== "function") return Promise.resolve(undefined);
    try {
      return Promise.resolve(modelCatalog.call(sessionSvc)).then(modelCatalogOfEnvelope, () => undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  };
}

/** 回落继承空选项（两字段清空 = 回落继承——档案 frontmatter 无键）。 */
export const INHERIT_OPTION = { value: "", label: "（回落继承）" } as const;

/** 目录 → provider 下拉选项（继承空选项 + 目录 provider id 保序；目录缺席 = 仅继承项）。 */
export function providerOptionsOf(
  catalog: readonly ModelCatalogEntry[] | undefined,
): readonly { value: string; label: string }[] {
  return [INHERIT_OPTION, ...(catalog ?? []).map((entry) => ({ value: entry.provider, label: entry.provider }))];
}

/** 目录 + 当前 provider → model 下拉选项（继承空选项 + 该 provider 模型保序）。 */
export function modelOptionsOf(
  catalog: readonly ModelCatalogEntry[] | undefined,
  provider: string,
): readonly { value: string; label: string }[] {
  const models = (catalog ?? []).find((entry) => entry.provider === provider)?.models ?? [];
  return [INHERIT_OPTION, ...models.map((model) => ({ value: model, label: model }))];
}
