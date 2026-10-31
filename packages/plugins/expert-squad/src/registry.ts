// registry —— 内存索引 + 取用 API（服务键 `experts`，tech-design §7 / AD1 / AD2 / AD3）。
// 取用 = 同步读内存快照（AD1 裁决）：scanExpertRoots 产出的一代冻结索引 + 启停状态
// 合成 ExpertRecord（origin/enabled 由本层附加）。fail-loud 错误语义：get(key) 对
// 不存在键抛 `expert not found: <key>`、对已禁用专家抛 `expert disabled: <key>`
// （消息含键名，供使用方分支）；list({ includeDisabled }) 默认只返回启用项。
// 热刷新：watch 层失效回调触发 refresh() 整体换代（重新扫描），换代后 get 立即
// 可见新内容；禁用状态独立于快照，换代不丢失。启停状态经 ExpertsStateFace
// （ExpertSquadState 的结构最小面，工作区隔离由 state 层 key 前缀承担，AD2/D4）；
// state 缺席 → FMEA 降级为内存态 + 重启回全启用。

import type { Context } from "@deepseek-ai/cordis";
import {
  ORIGIN_PRIORITY,
  scanExpertRoots,
  type ExpertOrigin,
  type ExpertRoot,
  type ExpertSnapshot,
} from "./store/scan.js";
import type { ExpertRecord, ExpertReasoning } from "./store/frontmatter.js";

export type { ExpertReasoning } from "./store/frontmatter.js";

/** 路由三元组配置形状（Config 与档案 overlay 共用；各字段可缺省）。 */
export interface ExpertAgentOptionsConfig {
  provider?: string;
  model?: string;
  reasoning?: ExpertReasoning;
}

/**
 * experts 配置条目（cordis Config `experts` 映射值；键 = 专家实例 ID）。
 * 各字段可缺省 = 该项不覆写（V5：空壳条目等价无配置）；`disabled` 布尔位 =
 * 来源级禁用（对所有工作区生效，无工作区维度）。
 */
export interface ExpertConfigEntry {
  agentOptions?: ExpertAgentOptionsConfig;
  tools?: string[];
  skills?: string[];
  disabled?: boolean;
}

/** 插件 Config 二字段的 volatile 现读面（volatile 引用 `.get()` 快照——热刷新现读，零缓存）。 */
export interface ExpertsConfigFace {
  defaultAgentOptions?: () => ExpertAgentOptionsConfig | undefined;
  experts?: () => Readonly<Record<string, ExpertConfigEntry>> | undefined;
}

/** 诊断发射面（host 侧接线 = `diag/log` 事件域 emitDiag；缺席 = 装配层 console 兜底）。 */
export type DiagEmit = (level: "info" | "warn" | "error", event: string, message: string) => void;

/** 服务键名（cordis 具名服务——ctx.experts 正门）。 */
export const EXPERTS_SERVICE_KEY = "experts" as const;

/** 取用 API 业务错基类：消息恒含专家键名（AD1 fail-loud）。 */
export class ExpertAccessError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "ExpertAccessError";
  }
}

/** 键不存在。 */
export class ExpertNotFoundError extends ExpertAccessError {
  constructor(key: string) {
    super(key, `expert not found: ${key}`);
    this.name = "ExpertNotFoundError";
  }
}

/** 键存在但已禁用（派发组装点禁用档案不可误用——AD1）。 */
export class ExpertDisabledError extends ExpertAccessError {
  constructor(key: string) {
    super(key, `expert disabled: ${key}`);
    this.name = "ExpertDisabledError";
  }
}

/** 启停状态面（ExpertSquadState 结构最小面；工作区隔离语义由实现承担）。 */
export interface ExpertsStateFace {
  isDisabled(workspacePath: string, expertId: string): Promise<boolean>;
  setEnabled(workspacePath: string, expertId: string, enabled: boolean): Promise<void>;
}

/** 取用记录：档案半 + origin/enabled/updatedAt（§7 ExpertRecord 全字段）。 */
export type ExpertEntry = ExpertRecord & {
  origin: ExpertOrigin;
  enabled: boolean;
  /** 来源文件 mtime（ISO-8601——面板卡片更新时间页脚数据源）。 */
  updatedAt: string;
  /** 来源文件绝对路径——同键同 origin 可有多份（多插件注册同键内置），条目身份键。 */
  sourcePath: string;
  /**
   * 专家实例 ID（D6/D7：`插件名#键` / `layer:user#键` / `layer:project#键`）——
   * experts 配置映射的寻址键；list/get 应答直接透出，写侧零手拼。
   */
  instanceId: string;
};

/**
 * 展示层全层条目（1.60 用户裁决：同名专家 UI 全层聚组展示）：ExpertEntry +
 * effective 位——true = 该键遮蔽胜出层（取用即它）；false = 被遮蔽层（只读展示）。
 * 仅面板 list 路由消费；取用语义（get/compose/启停）零改动。
 */
export type LayeredExpertEntry = ExpertEntry & {
  readonly effective: boolean;
};

/** 服务键 `experts` 契约面（§7）。 */
export interface ExpertsService {
  /** 不存在 → ExpertNotFoundError；禁用 → ExpertDisabledError（消息含键名）。 */
  get(key: string): ExpertEntry;
  /** 默认只返回启用项；includeDisabled 显式开启才含禁用（enabled 标记如实）。 */
  list(opts?: { includeDisabled?: boolean }): ExpertEntry[];
  /** 追加上层内置专家目录（plugin 内置层），下次 refresh 生效；pluginName = 实例 ID 前缀。 */
  registerRoot(ctx: Context, dir: string, pluginName?: string): void;
  /**
   * 启停切换（工作区隔离由 state 层承担，AD2）；对不存在键 fail-loud。
   * bug 950b845c：Dialog 面已退役此径（启停写 experts.<实例ID>.disabled 位——来源级，
   * settings revisioned 缝）；现役消费方 = enable_expert/disable_expert 工具。
   */
  setEnabled(key: string, enabled: boolean): Promise<void>;
}

export interface ExpertsRegistryOptions {
  /** root 清单供给（函数形态：registerRoot 追加后重扫取最新）。 */
  roots: () => readonly ExpertRoot[];
  /** 启停状态（缺席 → 内存态降级，FMEA）。 */
  state?: ExpertsStateFace;
  /** 工作区路径（state 隔离键取值点，D4——tool 面/路由侧传入）。 */
  workspace?: string;
  /** 插件 Config 二字段现读面（缺席 = 未配置形态——settings/ctx.config 缺席照常取用）。 */
  config?: ExpertsConfigFace;
  /** 诊断发射面（悬空键 error 日志；缺席 = 悬空仅静默跳过）。 */
  diag?: DiagEmit;
}

export class ExpertsRegistry implements ExpertsService {
  private snapshot: ExpertSnapshot | null = null;
  private readonly extraRoots: ExpertRoot[] = [];
  /** 本次 registry 生命周期内的禁用键集（state 缺席时的降级存储 + 同步读缓存）。 */
  private readonly disabledKeys = new Set<string>();
  /** 悬空键报告去重（每代快照每键至多一次；换代重置——恢复后再消失须重报）。 */
  private readonly danglingReported = new Set<string>();
  private readonly refreshing: Promise<void>[] = [];

  constructor(private readonly options: ExpertsRegistryOptions) {}

  /** Config 二字段现读快照（volatile 引用 .get() 每次现取——热刷新零接线生效）。 */
  private readConfig(): { defaults: ExpertAgentOptionsConfig | undefined; experts: Readonly<Record<string, ExpertConfigEntry>> | undefined } {
    return {
      defaults: this.options.config?.defaultAgentOptions?.(),
      experts: this.options.config?.experts?.(),
    };
  }

  /** 配置条目查取（实例 ID 寻址——字符串等值命中）。 */
  private configEntryOf(instanceId: string): ExpertConfigEntry | undefined {
    return this.readConfig().experts?.[instanceId];
  }

  /** 来源级禁用判定：工作区启停 ∨ experts 条目 disabled 位（或运算、两层独立）。 */
  private isDisabled(name: string, instanceId: string): boolean {
    if (this.disabledKeys.has(name)) return true;
    return this.configEntryOf(instanceId)?.disabled === true;
  }

  /** 索引整体换代：重扫全部 root + 重载启停态（watch 失效回调的落点）。 */
  async refresh(): Promise<void> {
    const roots = [...this.options.roots(), ...this.extraRoots];
    const snapshot = await scanExpertRoots(roots);
    const workspace = this.options.workspace;
    if (this.options.state !== undefined && workspace !== undefined) {
      const disabled = new Set<string>();
      for (const name of snapshot.experts.keys()) {
        if (await this.options.state.isDisabled(workspace, name)) disabled.add(name);
      }
      this.disabledKeys.clear();
      for (const name of disabled) this.disabledKeys.add(name);
    }
    this.danglingReported.clear();
    this.snapshot = snapshot;
  }

  /**
   * 悬空键对账（proposal D4：配置在场档案缺席 = bug，emitDiag error 点名键，无 UI 面）。
   * 不漏报 = dom(experts) \ 全层在场键集；不误报前置门：快照空代（未首刷）不判
   * （V4-EX2）；被遮蔽层在场算在场（V3：present = ⋃ layers）。每代快照每键至多报一次。
   */
  private reportDanglingConfigKeys(): void {
    const experts = this.readConfig().experts;
    if (experts === undefined) return;
    const snapshot = this.snapshot;
    if (snapshot === null) return; // 空代不判悬空
    const present = new Set<string>();
    for (const scanned of snapshot.experts.values()) present.add(scanned.instanceId);
    for (const layerEntries of snapshot.layers.values()) {
      for (const scanned of layerEntries) present.add(scanned.instanceId);
    }
    for (const key of Object.keys(experts)) {
      if (present.has(key) || this.danglingReported.has(key)) continue;
      this.danglingReported.add(key);
      this.options.diag?.(
        "error",
        "expert-squad-dangling-expert-config",
        `experts 配置键悬空（配置在场而专家档案缺席）：${key}`,
      );
    }
  }

  /** 面板 ErrorBar / 诊断：本代快照的降级 warnings（root 级/文件级）。 */
  get warnings(): readonly string[] {
    return this.snapshot?.warnings ?? [];
  }

  get(key: string): ExpertEntry {
    this.reportDanglingConfigKeys();
    const scanned = this.snapshot?.experts.get(key);
    if (scanned === undefined) throw new ExpertNotFoundError(key);
    if (this.isDisabled(key, scanned.instanceId)) throw new ExpertDisabledError(key);
    return buildEntry(scanned, true, this.configEntryOf(scanned.instanceId), this.readConfig().defaults);
  }

  list(opts?: { includeDisabled?: boolean }): ExpertEntry[] {
    this.reportDanglingConfigKeys();
    const defaults = this.readConfig().defaults;
    const entries: ExpertEntry[] = [];
    for (const scanned of this.snapshot?.experts.values() ?? []) {
      const disabled = this.isDisabled(scanned.name, scanned.instanceId);
      if (visible(disabled, opts?.includeDisabled)) {
        entries.push(buildEntry(scanned, !disabled, this.configEntryOf(scanned.instanceId), defaults));
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 展示层全层列表（1.60 用户裁决）：同键返回全部层条目（effective 位标记遮蔽
   * 胜出层），供面板聚组对比。语义：
   * - 生效条目沿用 list 启停可见性（禁用默认不可见，includeDisabled 显式开启才含）；
   * - 被遮蔽条目恒在场（展示层全量；只读——无任何取用/操作语义附丽）；
   * - 排序：键名字典序；同键内生效条目首张，其后按 origin 高→低（project > user > plugin）。
   */
  listLayered(opts?: { includeDisabled?: boolean }): LayeredExpertEntry[] {
    this.reportDanglingConfigKeys();
    const snapshot = this.snapshot;
    if (snapshot === null) return [];
    const defaults = this.readConfig().defaults;
    const out: LayeredExpertEntry[] = [];
    for (const [name, layerEntries] of snapshot.layers) {
      // 生效位 = 该键最高优先级层（project > user > plugin——与 experts 取用单点同源：
      // 扫描覆盖序决定 experts.get 恒为最高层；启停只影响可见性，不改层位）。
      // 禁用判定并入来源级 experts 条目 disabled 位——layers 低→高序，末位即生效
      // 实例，以其 instanceId 判定。
      const effectiveId = layerEntries[layerEntries.length - 1]?.instanceId ?? name;
      const disabled = this.isDisabled(name, effectiveId);
      // 升序排好后倒序索引遍历：末位即生效层，免二次拷贝与恒等比较。
      const ordered = [...layerEntries].sort(
        (a, b) =>
          ORIGIN_PRIORITY.indexOf(a.origin) - ORIGIN_PRIORITY.indexOf(b.origin),
      );
      const last = ordered.length - 1;
      for (let i = last; i >= 0; i--) {
        const scanned = ordered[i]!;
        const effective = i === last;
        if (effective && !visible(disabled, opts?.includeDisabled)) continue;
        out.push({
          ...buildEntry(scanned, !disabled, this.configEntryOf(scanned.instanceId), defaults),
          effective,
        });
      }
    }
    return out.sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        Number(b.effective) - Number(a.effective),
    );
  }

  /** registerRoot(ctx, dir, pluginName?)：ctx 为调用方上下文（§7 签名正本，本层不消费）。 */
  registerRoot(_ctx: Context, dir: string, pluginName?: string): void {
    this.extraRoots.push({ origin: "plugin", dir, pluginName });
  }

  async setEnabled(key: string, enabled: boolean): Promise<void> {
    if (this.snapshot?.experts.has(key) !== true) throw new ExpertNotFoundError(key);
    const { state, workspace } = this.options;
    if (state !== undefined && workspace !== undefined) {
      await state.setEnabled(workspace, key, enabled);
    }
    if (enabled) this.disabledKeys.delete(key);
    else this.disabledKeys.add(key);
  }
}

/** 启停可见性单点谓词：禁用默认不可见，includeDisabled 显式开启才含。 */
function visible(disabled: boolean, includeDisabled?: boolean): boolean {
  return !disabled || includeDisabled === true;
}

/**
 * ScannedExpert → ExpertEntry（附加 enabled + instanceId；sourcePath 透传为条目身份键），
 * 并叠加 experts 配置条目（proposal D7 / verification V1·V5 收口）：
 * - tools/skills：条目在场即换源，缺席回落档案（过滤语义换源；管线必备并集保底由
 *   消费侧承担——plugin-forge deriveWorkerToolFilter 单源）；
 * - provider/model：优先级链折叠——① experts 条目 agentOptions（整组同给同缺；仅配
 *   model/provider 时该位并入基座，V1-EX1）> ② 档案 provider+model 成对 > ③
 *   defaultAgentOptions（基座）；
 * - reasoning：① 条目 reasoning > ② 档案 frontmatter > ③ defaultAgentOptions.reasoning
 *   > 缺省不下发。
 */
function buildEntry(
  scanned: ExpertSnapshot["experts"] extends ReadonlyMap<string, infer V> ? V : never,
  enabled: boolean,
  cfgEntry?: ExpertConfigEntry,
  defaults?: ExpertAgentOptionsConfig,
): ExpertEntry {
  // 基座 = ② 档案成对（整组语义，a599db30），不成对回落 ③ defaultAgentOptions；
  // 档案单边位（不成对）保留为末位回退（既有裸透传行为——无配置时零变化）。
  const profilePaired =
    scanned.provider !== undefined && scanned.model !== undefined;
  const base = {
    provider: profilePaired ? scanned.provider : defaults?.provider ?? scanned.provider,
    model: profilePaired ? scanned.model : defaults?.model ?? scanned.model,
  };
  const ov = cfgEntry?.agentOptions;
  const provider = ov?.provider ?? base?.provider;
  const model = ov?.model ?? base?.model;
  const reasoning = ov?.reasoning ?? scanned.reasoning ?? defaults?.reasoning;
  return {
    name: scanned.name,
    title: scanned.title,
    description: scanned.description,
    personaMd: scanned.personaMd,
    tools: cfgEntry?.tools ?? scanned.tools,
    skills: cfgEntry?.skills ?? scanned.skills,
    model,
    provider,
    ...(reasoning !== undefined ? { reasoning } : {}),
    origin: scanned.origin,
    enabled,
    updatedAt: scanned.updatedAt,
    sourcePath: scanned.filePath,
    instanceId: scanned.instanceId,
  };
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** experts 取用服务（本插件 provide；缺席 = 插件未装载） */
    experts: ExpertsService;
  }
}
