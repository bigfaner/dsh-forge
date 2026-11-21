// forge host 组合入口（forge-deep-pack 1.4——提案 §二.2 组合段定谳形态照抄）：
//   COMPOSED 组合清单单源（序即激活序）+ 在场守卫（消费点现查，P0 #7 三铁律）+
//   组合调用 = ctx.plugin(module, config) 官方缝（P0 #1 定谳——直调 module.apply
//   绕过 cordis inject 装配机械必抛，禁用）+ 诊断全经 emitDiag（AGENTS §7 禁 console）。
import * as project from "@dsh-forge/project";
import * as spec from "@dsh-forge/spec";
import * as taskLoop from "@dsh-forge/task-loop";
import * as expertSquad from "@dsh-forge/expert-squad";
import * as knowledge from "@dsh-forge/knowledge";
import { emitDiag } from "@dsh-forge/lib-diag";
import {
  derivePluginConfigs,
  PRESENCE_SERVICE_KEYS,
  type ComposedKey,
  type ForgeConfig,
} from "./assembly.js";

export const name = "@dsh-forge/forge"; // loader ID 校验 = 包名（产物契约）

/** 组合宿主 ctx 窄面（cordis Context 结构子集——plugin 组合缝 + reflect 现查 + diag emit） */
interface ComposeCtx {
  /** 官方组合缝（cordis plugin(plugin, config)——P0 #1 定谳正门） */
  plugin?(module: unknown, config?: unknown): unknown;
  /** 服务反射面（在场守卫消费点现查——可选具名服务官方面取法） */
  reflect?: { get?(name: string): unknown };
  /** 诊断发射面（diag/log 事件域——emitDiag 消费面） */
  emit(event: string, payload: unknown): unknown;
}

// 组合清单单源：顺序即激活序（cordis apply 次序事实源）；派发/pin/patch 生成共用此表
const COMPOSED = [
  { key: "project", module: project },
  { key: "spec", module: spec },
  { key: "task-loop", module: taskLoop },
  { key: "expert-squad", module: expertSquad },
  { key: "knowledge", module: knowledge },
] as const satisfies readonly { key: ComposedKey; module: unknown }[];

/** COMPOSED 键序导出（序即激活序 pin 锚——tests/forge/derive-configs.test.ts） */
export const COMPOSED_KEYS = COMPOSED.map((entry) => entry.key);

/**
 * 在场守卫单件现查（AGENTS §1.6——检测永不缓存，每个消费点调用期求值）。
 *
 * 【reflect 静态禁令豁免落款（AGENTS §1.6 / 提案评审 N3/N4 + P0 #7）】此处
 * `ctx.reflect.get` 为新代码非默认配方的局部成因例外：守卫对象 = 五件「是否已
 * 独立激活」，可选项天然无类型化消费面（type-only import 只保五件模块类型，
 * 不保跨件服务类型）；具体服务类型化消费已归各消费件自身（spec/task-loop inject
 * 声明）。守卫现查 + try/catch 吞异常为缺席 + 结果零 memoize——三铁律逐条满足。
 */
function isMemberActive(ctx: ComposeCtx, key: ComposedKey): boolean {
  try {
    return ctx.reflect?.get?.(PRESENCE_SERVICE_KEYS[key]) != null;
  } catch {
    return false; // 反射异常视同缺席（fail-soft——组合照常尝试，二次激活由 catch 让位承接）
  }
}

/**
 * forge apply（两通道通用——单行自插后五件不经插行，一律经组合激活）：
 * 逐件在场现查（solo 场景五件已独立激活 → 跳过该件组合）→ 未在场件经
 * ctx.plugin(module, config) 官方缝统一派发激活。cordis provide 不幂等
 * （P0 #7——二次 provide throw）：组合调用 throw 捕获后静默让位，emitDiag
 * warn 留痕不阻载（守卫两分支必经留痕——forge-compose-skip / forge-compose-apply）。
 */
export function apply(ctx: ComposeCtx, config: ForgeConfig = {}): void {
  if (typeof ctx.plugin !== "function") {
    // 非 cordis 宿主（组合缝缺席）——零组合不阻载，warn 留痕（禁静默）。
    emitDiag(ctx, {
      event: "forge-compose-skip",
      level: "warn",
      process: "main",
      message: "ctx.plugin 组合缝缺席（非 cordis 宿主）——零组合，五件回落单装语义",
    });
    return;
  }
  const pluginConfigs = derivePluginConfigs(config); // home 唯一键延伸 → 五件 config 派发（单源）
  const skipped: string[] = [];
  const applied: string[] = [];
  for (const { key, module } of COMPOSED) {
    if (isMemberActive(ctx, key)) {
      skipped.push(key); // 消费点现查跳过（solo 场景）——结果零缓存
      continue;
    }
    try {
      // 官方缝组合（P0 #1 定谳）：inject 经 Inject.resolve + Fiber 拦截面完整消费。
      ctx.plugin.call(ctx, module, pluginConfigs[key]);
      applied.push(key);
    } catch (cause) {
      // cordis 二次注册/provide 不幂等 throw——静默让位（不阻载 forge 自身），
      // warn 留痕不吞（AGENTS §7 诊断不静默）。
      skipped.push(key);
      emitDiag(ctx, {
        event: "forge-compose-skip",
        level: "warn",
        process: "main",
        message: `${key} 组合让位（cordis 二次激活 throw——捕获静默让位）：${String(cause)}`,
      });
    }
  }
  if (skipped.length > 0) {
    emitDiag(ctx, {
      event: "forge-compose-skip",
      level: "info",
      process: "main",
      message: `五件已独立激活（solo 场景），跳过组合：${skipped.join(",")}`,
    });
  }
  if (applied.length > 0) {
    emitDiag(ctx, {
      event: "forge-compose-apply",
      level: "info",
      process: "main",
      message: `执行五件组合激活：${applied.join(",")}`,
    });
  }
}
