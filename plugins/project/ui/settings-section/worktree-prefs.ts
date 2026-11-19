// worktree 偏好配置节纯逻辑（零 react——fake configForms 两态与劣形退默认的判定/写径单源）。
// 读：快照 value.worktree.crossBranchRiskDismissed 布尔窄读，劣形（快照缺/非对象/worktree 组
// 非对象/位非布尔）= 默认 false（不抑制跨分支确认——fail-soft 与 worktree-picker 装载口径同源）。
// 写：官方 configForms revisioned 正门（form.set 整字段落 worktree 组——expert-squad
// defaultAgentOptions 同型）；true = 位落位，false = 键归缺（回退默认不抑制——配置面无死位）；
// 拒写背压重试（fresh revision 快照重合成——bug 908dc82e 同族刻度），全耗尽 = false 不静默丢写。
// bundle 自含纪律：结构同型镜像 dsh-client-ui-settings config-form 消费切片，零上游 import。

/** 官方 ConfigForm 消费切片（结构同型镜像——只承载本节用到的面：快照/订阅/定向字段写）。 */
export interface ConfigFormMirror {
  getSnapshot(): {
    status: "loading" | "ready" | "unavailable";
    value: unknown;
    revision: number | undefined;
    writable: boolean;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<boolean>;
  unset(field: string): Promise<boolean>;
}

/** 官方 configForms 服务消费切片（get(namespace) → ConfigForm 镜像；whileServed 在场门可选）。 */
export interface ConfigFormsFace {
  get(namespace: string): ConfigFormMirror | undefined;
  whileServed?(
    namespaces: readonly string[],
    register: (served: ReadonlySet<string>) => () => void,
  ): () => void;
}

/** worktree 偏好组字段名（config 节整字段写键——归属表 worktree.crossBranchRiskDismissed 组）。 */
export const WORKTREE_FIELD = "worktree";
/** 「不再提示」位键（settings-unification 归属表 project 行——跨分支风险确认用户级一票）。 */
export const DISMISSED_KEY = "crossBranchRiskDismissed";

// ── 插件自有配置承载面（fix-1 用户裁定 2026-11-13④——configForms serve 缺席降级形态）：
// 持久化读写在插件域完成（renderer localStorage——官方 web/desktop 宿主同域），serve 在场
// 形态维持官方正门；两形态行为对齐（快照 ready + writable、写径读回成立）。

/** 插件域持久化存储切片（官方宿主 renderer localStorage 同形——注入面供单测收敛）。 */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 本插件偏好落 localStorage 的键（插件域命名空间——零宿主键位侵占）。 */
export const LOCAL_PREFS_STORAGE_KEY = "@dsh-forge/project:worktree-prefs";

/** 缺省存储（renderer localStorage——Node/非浏览器环境 = undefined，快照退 unavailable）。 */
function defaultStorage(): PrefsStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : (localStorage as unknown as PrefsStorage);
  } catch {
    return undefined;
  }
}

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * 插件自有 ConfigForm 镜像（configForms serve 缺席降级形态）：快照 ready + writable、
 * 写径即持久化即读回（set 整字段落 worktree 组、unset 键归缺）——与官方 serve 在场形态
 * 行为对齐（WorktreePrefsSection/dismissedWriteOf 零改动直接可用）。
 * 单源纪律（bug 2b2c0e1a）：无参取法（生产 inject 面）= 模块级单实例——inject 间复用
 * 同一 store（快照身份稳定，subscribe 不随取法换实例）；显式注入存储（测试收敛面）=
 * 独立实例。快照缓存：getSnapshot 返回缓存对象（同存储下多次取法同一引用——useSyncExternalStore
 * 快照身份漂移 = React #185 无限更新的复现路径），写径换代或存储面更换时重建快照并 notify。
 */
let sharedMirror: ConfigFormMirror | undefined;

export function localFormMirror(storage?: PrefsStorage): ConfigFormMirror {
  if (storage === undefined) {
    if (sharedMirror === undefined) sharedMirror = buildMirror(defaultStorage);
    return sharedMirror;
  }
  const resolved = storage;
  return buildMirror(() => resolved);
}

function buildMirror(storageOf: () => PrefsStorage | undefined): ConfigFormMirror {
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener();
  };
  const read = (): unknown => {
    const storage = storageOf();
    if (storage === undefined) return undefined;
    try {
      const raw = storage.getItem(LOCAL_PREFS_STORAGE_KEY);
      return raw === null ? undefined : (JSON.parse(raw) as unknown);
    } catch {
      return undefined; // 劣形落盘值 = 视同空配置（fail-soft 不炸读径）
    }
  };
  type MirrorSnapshot = ReturnType<ConfigFormMirror["getSnapshot"]>;
  let cachedStorage: PrefsStorage | undefined;
  let snapshot: MirrorSnapshot | undefined;
  const ensure = (): MirrorSnapshot => {
    const storage = storageOf();
    if (snapshot === undefined || cachedStorage !== storage) {
      cachedStorage = storage;
      snapshot = {
        status: storage === undefined ? ("unavailable" as const) : ("ready" as const),
        value: read(),
        revision: undefined,
        writable: storage !== undefined,
      };
    }
    return snapshot;
  };
  const write = (next: Record<string, unknown>): void => {
    const storage = storageOf();
    if (storage === undefined) return;
    try {
      storage.setItem(LOCAL_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 持久化失败 = 写径照常生效（内存态），不静默炸链路——读回缺失按默认值语义
    }
    cachedStorage = storage;
    snapshot = {
      status: "ready",
      value: next,
      revision: undefined,
      writable: true,
    };
    notify();
  };
  return {
    getSnapshot: () => ensure(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: async (field: string, value: unknown) => {
      if (storageOf() === undefined) return false;
      const merged = { ...asRecord(read()) };
      merged[field] = value;
      write(merged);
      return true;
    },
    unset: async (field: string) => {
      if (storageOf() === undefined) return false;
      const merged = { ...asRecord(read()) };
      delete merged[field];
      write(merged);
      return true;
    },
  };
}

/** 「不再提示」位读取（劣形退默认 false——非严格 true 一律不抑制）。 */
export function dismissedOf(configValue: unknown): boolean {
  const worktree = asRecord(asRecord(configValue)?.[WORKTREE_FIELD]);
  return worktree?.[DISMISSED_KEY] === true;
}

/**
 * worktree 组写值合成：true = 位落位；false = 键归缺（回退默认不抑制）；
 * prior 组内其余键逐字保留（零共享写点——只动本位）。
 */
export function worktreePatchOf(prior: unknown, dismissed: boolean): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...asRecord(prior) };
  if (dismissed) merged[DISMISSED_KEY] = true;
  else delete merged[DISMISSED_KEY];
  return merged;
}

export interface DismissedWriteOptions {
  /** 背压重试上界（含首写；缺省 5 = 官方 reconcile/entry fiber 热重载窗口刻度）。 */
  readonly attempts?: number;
  /** 重试间隔 ms（缺省 2s；单测传 0 收敛）。 */
  readonly delayMs?: number;
}

/**
 * 「不再提示」位写缝（revisioned 正门）：快照 ready+writable 才落写；拒写 = fresh revision
 * 快照重合成再写（固定间隔背压）；全耗尽 / 快照不可写 = false（调用面留痕，不静默丢写）。
 */
export function dismissedWriteOf(
  form: ConfigFormMirror,
  options: DismissedWriteOptions = {},
): ((dismissed: boolean) => Promise<boolean>) | undefined {
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 2_000;
  return async (dismissed: boolean): Promise<boolean> => {
    for (let left = attempts; ; left -= 1) {
      const snapshot = form.getSnapshot();
      if (snapshot.status !== "ready" || !snapshot.writable) return false;
      const prior = asRecord(snapshot.value)?.[WORKTREE_FIELD];
      const accepted = await form.set(WORKTREE_FIELD, worktreePatchOf(prior, dismissed));
      if (accepted) return true;
      if (left <= 1) return false;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  };
}
