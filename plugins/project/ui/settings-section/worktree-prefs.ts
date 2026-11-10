// worktree 偏好配置节纯逻辑（零 react——fake configForms 两态与劣形退默认的判定/写径单源）。
// 读：快照 value.worktree.crossBranchRiskDismissed 布尔窄读，劣形（快照缺/非对象/worktree 组
// 非对象/位非布尔）= 默认 false（不抑制跨分支确认——fail-soft 与 WorktreeFaces 装载口径同源）。
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

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
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
