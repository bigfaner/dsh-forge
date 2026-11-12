// preset-rows —— 专家档案 → agentPreset 行（fix-1 官方正本核销通道）：
// persona/工具白名单的注入通道 = agentPreset（dsh-subagent 0.2.2-rc.1 README:63-65
// Child presets 段——in-process spawn 接受独立 agentPreset；preset 承载 = tools +
// prompt sections 声明式组合，agent-preset-registry README）。程序化注册正门 =
// AgentPresetRegistry.register(PresetDefinition)（官方 definition.d.ts：「Register
// and eagerly load a definition … The declaring plugin owns it」——返回 disposer，
// 撤行/换代即 dispose）。装载期批量预注册（每位启用专家一行）+ recruit/update/
// rename/启停增删同步（ExpertPresetSync.syncFrom 幂等调和）。
//
// 行构造（buildExpertPresetDefinition）：
// - id = expert-<档案键>（与委派请求 request.agentPreset 双端锚）；
// - persona = @deepseek-ai/dsh-persona 行 config.prefix 承载人设全文合成（身份头 +
//   人设原文，与旧 SubagentStartRequest.persona 语义逐字等价——preset 挂载时
//   shadow 部署 persona，dsh-persona README）；
// - 白名单 = 本包 expert-restrict 行 config.allow（官方 ctx.tools.restrict
//   fail-closed 平台语义：allow 外工具从子会话消失且拒绝执行）。
// 同步语义：同指纹跳过（幂等短路）；内容变更换代（dispose 旧 + register 新）；
// 禁用/移除撤行；注册/求交失败 = diag warn 跳过该专家，不炸同步、不阻载插件。

import type { PresetDefinition } from "@deepseek-ai/dsh-agent-preset-registry";
import { composePersonaText } from "@dsh-forge/contracts";
import type { ExpertEntry, ExpertsService } from "./registry.js";
import type { DiagEmit } from "./registry.js";
import { resolveToolAllow, expertPresetId, type KnownToolsProbe } from "./dispatch/compose.js";

/** persona 段行名（官方 composable persona row——preset 挂载 shadow 部署 persona）。 */
export const EXPERT_PERSONA_ROW_NAME = "@deepseek-ai/dsh-persona" as const;

/** 白名单段行名（本包 expert-restrict 子路径导出——ctx.tools.restrict fail-closed）。 */
export const EXPERT_RESTRICT_ROW_NAME = "@dsh-forge/expert-squad/expert-restrict" as const;

/** preset 行 disposer 面（官方 register 返回——declaring plugin owns it）。 */
export type PresetRowDisposer = () => Promise<void>;

/** 官方 agentPresets 注册面窄型（AgentPresetRegistry.register 结构子面）。 */
export interface PresetRegistryFace {
  register(definition: PresetDefinition): Promise<PresetRowDisposer>;
}

/**
 * 构造一位专家的 preset 行定义（纯函数——persona 合成与白名单由调用方求交后注入）。
 */
export function buildExpertPresetDefinition(
  entry: ExpertEntry,
  allow: readonly string[],
): PresetDefinition {
  return {
    id: expertPresetId(entry.name),
    name: entry.title,
    description: entry.description,
    plugins: [
      {
        id: "persona",
        name: EXPERT_PERSONA_ROW_NAME,
        config: { prefix: composePersonaText(entry) },
      },
      {
        id: "tool-restrict",
        name: EXPERT_RESTRICT_ROW_NAME,
        config: { allow: [...allow] },
      },
    ],
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

/** 单专家 preset 行台账项（换代判定 = 指纹比对）。 */
interface LiveRow {
  readonly fingerprint: string;
  readonly dispose: PresetRowDisposer;
}

/**
 * 专家 preset 行同步器：装载期批量预注册 + 增删同步（幂等调和）。
 * 每次同步对启用专家全集求目标行集：新键注册、内容变更换代、缺席撤行。
 */
export class ExpertPresetSync {
  private readonly live = new Map<string, LiveRow>();
  /** 串行化同步链（并发同步不交错换代）。 */
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ExpertPresetSyncDeps) {}

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
        // 白名单平台求交（构建期一次；restrict 对未知名硬抛错——原样透传会让跨机
        // 档案必然拆 preset 行装载）。空集 fail-loud = 档案配置错误 → warn 跳过
        // 不注册空白名单行。
        const allow = resolveToolAllow(entry.tools, known);
        definition = buildExpertPresetDefinition(entry, allow);
        fingerprint = JSON.stringify([entry.title, entry.description, composePersonaText(entry), allow]);
      } catch (error) {
        // 档案缺陷（空白名单等）：撤既有行（如有）+ warn 跳过
        const stale = this.live.get(key);
        if (stale !== undefined) {
          this.live.delete(key);
          await stale.dispose().catch(() => {});
        }
        this.deps.diag("warn", "expert-squad-preset-skip", `expert「${key}」preset 行未同步（档案配置缺陷）: ${String((error as Error)?.message ?? error)}`);
        continue;
      }
      const hit = this.live.get(key);
      if (hit !== undefined && hit.fingerprint === fingerprint) continue; // 同指纹幂等短路
      if (hit !== undefined) {
        this.live.delete(key);
        await hit.dispose().catch(() => {});
      }
      try {
        const dispose = await this.deps.presets.register(definition);
        this.live.set(key, { fingerprint, dispose });
      } catch (error) {
        this.deps.diag("warn", "expert-squad-preset-register-fail", `expert「${key}」preset 行注册失败（该专家委派将诚实降级）: ${String((error as Error)?.message ?? error)}`);
      }
    }
  }
}
