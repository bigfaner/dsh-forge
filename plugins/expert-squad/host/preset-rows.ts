// preset-rows —— 专家档案 → agentPreset 行（fix-1 官方正本核销通道）：
// persona/工具行的注入通道 = agentPreset（dsh-subagent Child presets 段——in-process spawn
// 接受独立 agentPreset；preset 承载 = tools + prompt sections 声明式组合，
// agent-preset-registry README）。程序化注册正门 = AgentPresetRegistry.register(PresetDefinition)
// （官方 definition.d.ts：「Register and eagerly load a definition … The declaring plugin
// owns it」——返回 disposer，撤行/换代即 dispose）。装载期批量预注册（每位启用专家一行）+
// recruit/update/rename/启停增删同步（ExpertPresetSync.syncFrom 幂等调和）。
//
// 行构造（buildExpertPresetDefinition）：
// - id = 档案键原样（与委派请求 request.agentPreset 双端锚——用户裁定 2026-11-24 移除 expert- 前缀）；
// - persona = @deepseek-ai/dsh-persona 行 config.prefix 承载人设全文合成（身份头 +
//   人设原文，与旧 SubagentStartRequest.persona 语义逐字等价——preset 挂载时
//   shadow 部署 persona，dsh-persona README）；
// - 模型工具行 = tool-rows.ts 行常量全集（供给半——子树声明的行才进子会话工具面）。
//
// 白名单落点（agent/created 通道，2026-11-25 真机定谳）：
//   白名单不在 preset 内落。preset scope 内 restrict 掩不到同层工具行（own 层豁免——
//   dsh-tools view()）；改由 host/index.ts 的 agent/created 监听器把 allow 落到
//   **子 agent scope**——preset 层工具对其为 inherited，可掩（真机 80 → 3）。
//   allow 在此（reconcile——async 上下文）求交后存台账 allowOf(key)，监听器只查表
//   （同步——监听器抛错 = agent 创建回滚 = 宿主 fatal，2026-11-25 崩溃判例）。
//   求交基准 = 全模式并集探针（createUnionToolNamesProbe——global ∪ 各 preset standing
//   scope，与子会话创建时序无关；agent/created 时点的子 scope 瞬时视图不稳定）。
// 同步语义：同指纹跳过（幂等短路）；内容变更换代（dispose 旧 + register 新）；
// 禁用/移除撤行；注册/求交失败 = diag warn 跳过该专家，不炸同步、不阻载插件。

import type { PresetDefinition } from "@deepseek-ai/dsh-agent-preset-registry";
import { composePersonaText } from "@dsh-forge/lib-api/subagent-assemble";
import type { ExpertEntry, ExpertsService } from "./registry.js";
import type { DiagEmit } from "./registry.js";
import { resolveToolAllow, type KnownToolsProbe } from "./dispatch/compose.js";
import { EXPERT_TOOL_ROWS } from "./tool-rows.js";

/** persona 段行名（官方 composable persona row——preset 挂载 shadow 部署 persona）。 */
export const EXPERT_PERSONA_ROW_NAME = "@deepseek-ai/dsh-persona" as const;

/** preset 行 disposer 面（官方 register 返回——declaring plugin owns it）。 */
export type PresetRowDisposer = () => Promise<void>;

/** 官方 agentPresets 注册面窄型（AgentPresetRegistry.register 结构子面）。 */
export interface PresetRegistryFace {
  register(definition: PresetDefinition): Promise<PresetRowDisposer>;
}

/** 专家 preset 子树的行集（纯函数——persona + 模型工具行全集；白名单不在此落）。 */
export function expertPresetRows(entry: ExpertEntry): PresetDefinition["plugins"] {
  return [
    {
      id: "persona",
      name: EXPERT_PERSONA_ROW_NAME,
      config: { prefix: composePersonaText(entry) },
    },
    ...EXPERT_TOOL_ROWS,
  ];
}

/**
 * 构造一位专家的 preset 定义（纯函数）。allow 不进定义——由调用方存台账供
 * agent/created 监听器消费（见文件头「白名单落点」）。
 */
export function buildExpertPresetDefinition(entry: ExpertEntry): PresetDefinition {
  return {
    id: entry.name, // 用户裁定 2026-11-24：preset 行 id = 档案键原样（无前缀）
    name: entry.title,
    description: entry.description,
    plugins: expertPresetRows(entry),
  };
}

/** 同步依赖面。 */
export interface ExpertPresetSyncDeps {
  /** 官方 agentPresets 注册正门（register）。 */
  readonly presets: PresetRegistryFace;
  /** 白名单求交探针（全模式并集面——bug e3b045dc 同径；缺席 = 不裁剪）。 */
  readonly knownTools?: KnownToolsProbe;
  /** 诊断发射面（注册失败/空白名单 warn——AGENTS §7 不静默）。 */
  readonly diag: DiagEmit;
}

/** 单专家 preset 行台账项（换代判定 = 指纹比对；allow = agent/created 监听器消费的白名单）。 */
interface LiveRow {
  readonly fingerprint: string;
  /** 档案 tools ∩ 已知名（求交在 reconcile 的 async 上下文完成——监听器只读）。 */
  readonly allow: readonly string[];
  readonly dispose: PresetRowDisposer;
}

/**
 * 专家 preset 行同步器：装载期批量预注册 + 增删同步（幂等调和）。
 * 每次同步对启用专家全集求目标行集：新键注册、内容变更换代、缺席撤行。
 * 兼任白名单台账：agent/created 监听器经 allowOf(key) 同步取 allow（不现算——
 * 求交需异步探针，监听器内 await 的 rejection 会致宿主 fatal）。
 */
export class ExpertPresetSync {
  private readonly live = new Map<string, LiveRow>();
  /** 串行化同步链（并发同步不交错换代）。 */
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ExpertPresetSyncDeps) {}

  /**
   * 读一位专家的已求交白名单（同步、纯读——agent/created 监听器消费面）。
   * 返回 undefined = 该键无在册 preset 行（非专家子会话 / 已禁用 / 注册失败），
   * 调用方据此零动作。
   */
  allowOf(key: string | undefined): readonly string[] | undefined {
    return key === undefined ? undefined : this.live.get(key)?.allow;
  }

  /**
   * 对 registry 当前一代启用专家调和 preset 行（fire-and-forget 安全——内部串行链，
   * 失败仅 diag warn 逐专家跳过，不抛出）。
   */
  syncFrom(registry: ExpertsService): Promise<void> {
    const next = this.chain.then(
      () => this.reconcile(registry),
      () => this.reconcile(registry), // 上代失败不阻塞换代
    );
    this.chain = next.catch(() => {});
    return next;
  }

  /** 撤全部行（插件卸载级联——ctx.effect disposer 消费）。 */
  async disposeAll(): Promise<void> {
    await this.chain.catch(() => {});
    const rows = [...this.live.values()];
    this.live.clear();
    for (const row of rows) {
      await row.dispose().catch(() => {});
    }
  }

  private async reconcile(registry: ExpertsService): Promise<void> {
    const entries = registry.list(); // 默认仅启用项——禁用/移除即撤行
    const desired = new Set(entries.map((e) => e.name));

    // 撤行：台账有而当前专家集无（entries() 快照迭代——迭代中 delete 安全）
    for (const [key, row] of this.live.entries()) {
      if (desired.has(key)) continue;
      this.live.delete(key);
      await row.dispose().catch((error: unknown) => {
        this.deps.diag("warn", "expert-squad-preset-dispose-fail", `preset 行撤行失败（expert=${key}）: ${String((error as Error)?.message ?? error)}`);
      });
    }

    const known = await this.deps.knownTools?.();
    for (const entry of entries) {
      const key = entry.name;
      let definition: PresetDefinition;
      let fingerprint: string;
      try {
        // 白名单求交（构建期一次）。求交基准 = 全模式并集探针（与子会话创建时序无关）；
        // 未知名剔除（restrict 对未知名整条作废）。空集 fail-loud = 档案配置错误 →
        // warn 跳过不注册。
        const allow = resolveToolAllow(entry.tools, known);
        definition = buildExpertPresetDefinition(entry);
        fingerprint = JSON.stringify([entry.title, entry.description, composePersonaText(entry), allow, EXPERT_TOOL_ROWS]);
        const hit = this.live.get(key);
        if (hit !== undefined && hit.fingerprint === fingerprint) continue; // 同指纹幂等短路
        if (hit !== undefined) {
          this.live.delete(key);
          await hit.dispose().catch(() => {});
        }
        try {
          const dispose = await this.deps.presets.register(definition);
          this.live.set(key, { fingerprint, allow, dispose });
        } catch (error) {
          this.deps.diag("warn", "expert-squad-preset-register-fail", `expert「${key}」preset 注册失败（该专家委派将诚实降级）: ${String((error as Error)?.message ?? error)}`);
        }
      } catch (error) {
        // 档案缺陷（空白名单等）：撤既有行（如有）+ warn 跳过
        const stale = this.live.get(key);
        if (stale !== undefined) {
          this.live.delete(key);
          await stale.dispose().catch(() => {});
        }
        this.deps.diag("warn", "expert-squad-preset-skip", `expert「${key}」preset 行未同步（档案配置缺陷）: ${String((error as Error)?.message ?? error)}`);
      }
    }
  }
}
