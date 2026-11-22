// dock tab 族注册面（1.13——概览 tab 双形态注册切换版）：
// 两段注册（官方口径「adding a type is a registration, never an edit」）：
//   第一段 = sidebarRightTabs.register 页型（单装形态专属——project 在场时页型归
//     project 拥有者，官方 registry 同 id 二次注册抛错；单装缺位兜底 guide 入口卡
//     order 0 排最前）；
//   第二段 = `sidebar.right.pane.tab` keyed body（host-integration-fixes 裁决 1 双形态）：
//     apply 期槽 ledger 现查 project registrant 在座性——
//       在场（集成形态）→ 不注册自身 body/title，AC 进度段按子槽键落座注入 project 概览；
//       缺席（单装形态）→ priority -10 注册独立任务概览 body + chip 标题段。
//     slots.subscribe 订阅该槽：project 后到注册通知 → dispose 自身 body 切集成；
//     project 卸载通知 → 重注册切单装。订阅与各代注册 disposer wire 进 ctx.effect
//     （插件卸载级联清理）。装载顺序无关（官方 slots 机械核销：probes/host-integration-fixes/
//     slots-keyed-probe.md）。
// projectId 解析 = 页内 workbench 桥缝（`__DSH_FORGE_WORKBENCH__` overview.projectId——
// inject 期现查不缓存，缺席 = 「无任务数据」降级呈现不报错；身份官方语境直投 forgeTasks
// 快照族，host 半 forge.projects 缝解析归属键——客户端零投影，bug 9407ff29 修型）；数据
// 通道 = forgeTasks Typert namespace（makeClient 注入真身，缺席 = 调用期诚实降级）。
// 逐面 try/catch fail-soft（单面异常只降本面，console.warn 留痕不炸装配）。
import { useEffect, useState, type ReactNode } from "react";
import {
  AC_PROGRESS_ENTRY_KEY,
  DSWF_OVERVIEW_AC_PROGRESS_SLOT,
  DSWF_OVERVIEW_TAB_KEY,
  PRIORITY_PROJECT_OVERVIEW_OWNER,
  PRIORITY_TASK_LOOP_FALLBACK,
} from "@dsh-forge/lib-ui";
import { OverviewTab } from "./overview/overview-tab.js";
import { createForgeTasksClient, type ForgeTasksClientFactory } from "./tasks-rpc.js";
import { DSWF_DOC_ADDRESS_PREFIX, DSWF_DOC_TAB_KIND, docTabTitle, ForgeDocsTab } from "./dock-tabs/docs-tab.js";
import { typertRpcClientFactory } from "./dock-tabs/typert-transport.js";
import { SIDEBAR_RIGHT_PANE_TAB_SLOT, SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT, reflectGet, type OfficialSeamCtx } from "./official-seams.js";
import { defaultSelfAnchorResolver, selfAnchorSourceOf, useSelfAnchorProjectId, type SelfAnchorServices } from "./self-anchor.js";
import { registerKeyedSection, type SectionSlotsFace } from "./keyed-section.js";
import { FORGE_TASK_LOOP_LOCALE_NS, type LocaleServiceFace } from "./locale.js";

/**
 * task-loop 概览 tab 类型 kind（单源 = @dsh-forge/lib-ui DSWF_OVERVIEW_TAB_KEY——
 * host-integration-fixes 裁决 5 键族改引，包内字面量退役）。
 */
export const DSWF_OVERVIEW_TAB_KIND = DSWF_OVERVIEW_TAB_KEY;

/**
 * AC 进度子槽 keyed 占用键（单源 = @dsh-forge/lib-ui AC_PROGRESS_ENTRY_KEY——裁决 5
 * 改引，包内字面量退役；project 概览 renderSlot 以本键 entryKey 分发）。
 */
export const OVERVIEW_AC_PROGRESS_ENTRY_KEY = AC_PROGRESS_ENTRY_KEY;

/**
 * 双形态注册形态（诊断/e2e 锚——集成 = project 拥有概览主体 + AC 段注入；
 * 单装 = 独立任务概览 body 兜底）。
 */
export type DockTabsFormMode = "integrated" | "standalone";

/** 官方右栏 tab 类型注册表窄面（ui-sidebar-right SidebarRightTabRegistry 消费切片） */
interface SidebarRightTabsMirror {
  register(definition: {
    readonly id: string;
    readonly kind: string;
    readonly title: (address: string) => string;
    readonly multiple?: boolean;
    readonly patterns?: readonly string[];
    readonly canOpen?: (address: string) => boolean;
    readonly guide?: readonly {
      readonly id: string;
      readonly order: number;
      readonly title: (address: string) => string;
      readonly description?: () => string;
    }[];
  }): () => void;
}

/** workbench 桥窄面（壳 createWorkbenchBridge 产物结构同型镜像——overview.projectId 源） */
interface WorkbenchBridgeMirror {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Record<string, unknown>;
}

/** 页内桥缝读取（inject 期现查不缓存——缺席/劣形 = undefined fail-soft） */
export function workbenchBridgeOf(): WorkbenchBridgeMirror | undefined {
  const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__;
  if (typeof bridge !== "object" || bridge === null) return undefined;
  const record = bridge as Record<string, unknown>;
  return typeof record["subscribe"] === "function" && typeof record["getSnapshot"] === "function"
    ? (bridge as WorkbenchBridgeMirror)
    : undefined;
}

/** 桥快照 → 项目身份投影（overview.projectId 窄读——缺席 = undefined；bug 9407ff29 修型：
 *  客户端零投影零派生，uuid 原样直投 forgeTasks projectId 入参，host 半解析归属键） */
export function bridgeProjectIdOf(bridge: WorkbenchBridgeMirror | undefined): string | undefined {
  if (bridge === undefined) return undefined;
  const overview = bridge.getSnapshot()["overview"];
  if (typeof overview !== "object" || overview === null) return undefined;
  const projectId = (overview as Record<string, unknown>)["projectId"];
  return typeof projectId === "string" && projectId !== "" ? projectId : undefined;
}

/** 概览 seat 组件（keyed body/AC 进度段共用——projectId 双源解析：桥缝优先[壳宿主]，缺席
 *  宿主 = self-anchor 自解析补位[官方宿主——sessions/workspaces 快照 + forgeWorktree 归属
 *  裁决]，双缺 = 「无任务数据」降级呈现不报错） */
export function OverviewSeat(props: {
  readonly projectIdOf?: () => string | undefined;
  readonly makeClient?: ForgeTasksClientFactory;
  readonly bridge?: WorkbenchBridgeMirror;
  readonly selfAnchor?: SelfAnchorServices;
}): ReactNode {
  const resolve = props.projectIdOf ?? (() => bridgeProjectIdOf(props.bridge));
  const [projectId, setProjectId] = useState<string | undefined>(resolve());
  const anchored = useSelfAnchorProjectId(props.selfAnchor);
  useEffect(() => {
    const bridge = props.bridge ?? workbenchBridgeOf();
    if (bridge === undefined) return;
    setProjectId(resolve());
    return bridge.subscribe(() => setProjectId(resolve()));
    // resolve 闭包随 props 稳定（调用方保证——face 工厂单次装配）
  }, [props.bridge, props.projectIdOf]);
  // 双源归一：桥缝优先（壳宿主），桥值缺席时自解析补位（官方宿主水化门）
  const effective = projectId ?? anchored;
  return <OverviewTab projectId={effective} {...(props.makeClient !== undefined ? { makeClient: props.makeClient } : {})} />;
}

/** 注册面诊断（registered = 实际落座面；mode = 双形态终态——e2e/排障锚） */
export interface DockTabsFaceDiagnostics {
  readonly registered: string[];
  readonly mode: DockTabsFormMode;
}

/**
 * dock tab 族注册（apply 编排）：概览页型（单装兜底）+ 概览 keyed body 双形态切换 +
 * 文档资源型两段，逐面 fail-soft。locale 缺席 = title 回退 NS 键名呈现（注册不阻断）。
 */
export function registerDockTabsFace(
  ctx: OfficialSeamCtx,
  slots: SectionSlotsFace,
  locale: LocaleServiceFace | undefined,
): DockTabsFaceDiagnostics {
  const registered: string[] = [];
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace();
      registered.push(name);
    } catch (error) {
      console.warn(`[dsh-forge/task-loop] dock tab face '${name}' registration failed——降级不注册`, error);
    }
  };
  const t = locale?.bind(FORGE_TASK_LOOP_LOCALE_NS) ?? ((key: string) => key);
  const tabs = ctx.get("sidebarRightTabs") as SidebarRightTabsMirror | undefined;

  // 概览页型注册（单装形态专属段——裁决 1 复位：project 在场时页型归 project
  // （官方 registry 同 id 二次注册抛错），本包集成形态零页型注册；project 单装
  // 缺席时本段兜底承载页型 + guide 入口卡 order 0（官方入口卡 10/20/30——升序排最前）。
  const registerOverviewType = (): void => {
    face(`${DSWF_OVERVIEW_TAB_KIND}: dock tab type`, () => {
      if (tabs === undefined || typeof tabs.register !== "function") {
        throw new Error("ctx.sidebarRightTabs.register absent");
      }
      const disposeType = tabs.register({
        id: DSWF_OVERVIEW_TAB_KIND,
        kind: DSWF_OVERVIEW_TAB_KIND,
        title: () => t("tab.overview"),
        guide: [
          {
            id: "overview",
            order: 0,
            title: () => t("tab.overview"),
            description: () => t("guide.overview.desc"),
          },
        ],
      });
      disposerType = typeof disposeType === "function" ? disposeType : undefined;
      if (disposerType === undefined) throw new Error("sidebarRightTabs.register returned no disposer");
    });
  };

  // 第二段：概览 keyed body 双形态切换（裁决 1）。
  // project 在场现查 = 槽 ledger 原始账本（官方 SlotService.entries——含 options.key/
  // priority，跨插件可见；检测永不缓存——每个消费点现查，AGENTS 1.6）。裁决键 = 概览键
  // 占用条目按 lib/ui PRIORITY_PROJECT_OVERVIEW_OWNER（0）归属；本包任何形态都不得以
  // 同 priority 落座该键（官方同 key 同 priority 抛错即越权哨兵——不 try/catch 吞）。
  const ledger = slots as SectionSlotsFace & {
    entries?(slot: string): readonly { options?: Record<string, unknown> }[];
    subscribe?(slot: string, listener: () => void): (() => void) | undefined;
  };
  const projectPresent = (): boolean => {
    if (typeof ledger.entries !== "function") return false;
    try {
      const rows = ledger.entries(SIDEBAR_RIGHT_PANE_TAB_SLOT) ?? [];
      return rows.some((row) => {
        const options = row?.options;
        if (options?.["key"] !== DSWF_OVERVIEW_TAB_KIND) return false;
        return (typeof options["priority"] === "number" ? options["priority"] : 0) === PRIORITY_PROJECT_OVERVIEW_OWNER;
      });
    } catch (error) {
      console.warn("[dsh-forge/task-loop] slots.entries presence probe failed——按缺席裁决", error);
      return false;
    }
  };

  // 概览 inject face 工厂（集成 AC 段 / 单装 body 共用——桥缝 + forgeTasks 数据通道 +
  // 自解析补位缝，inject 期现查零实例缓存）
  const overviewInject = (): Record<string, unknown> => {
    const bridge = workbenchBridgeOf();
    return {
      // projectKey 随桥快照订阅解析（桥缺席 = undefined——组件空态呈现不报错）
      ...(bridge !== undefined ? { bridge } : {}),
      // 数据通道真身（forgeTasks Typert namespace——face 缺席调用期诚实降级）
      makeClient: createForgeTasksClient as ForgeTasksClientFactory,
      // 自解析补位缝（桥缺席宿主的身份水化门——sessions/workspaces 双通道取法：
      // inject 子 fiber 正门持有位优先，reflect 回退；服务惰性现查闭包，apply 点零实例缓存）
      selfAnchor: {
        sessionsList: () => selfAnchorSourceOf("sessions", reflectGet(ctx, "sessions", false)),
        workspacesList: () => selfAnchorSourceOf("workspaces", reflectGet(ctx, "workspaces", false)),
        resolveProjectId: defaultSelfAnchorResolver(),
      } satisfies SelfAnchorServices,
    };
  };

  // 当前代注册撤销器（rebind 逐代置换——ctx.effect 闭包按变量现值级联清理）
  let disposerType: (() => void) | undefined;
  let disposerBody: (() => void) | undefined;
  let disposerTitle: (() => void) | undefined;
  let disposerAc: (() => void) | undefined;
  let mode: DockTabsFormMode | undefined;

  /** 集成形态：AC 进度段按子槽键落座注入 project 概览（自身 body/title 零注册）。 */
  const registerIntegrated = (): void => {
    face(`${DSWF_OVERVIEW_AC_PROGRESS_SLOT}:${OVERVIEW_AC_PROGRESS_ENTRY_KEY}`, () => {
      disposerAc = registerKeyedSection(slots, {
        slot: DSWF_OVERVIEW_AC_PROGRESS_SLOT,
        key: OVERVIEW_AC_PROGRESS_ENTRY_KEY,
        inject: overviewInject,
        component: OverviewSeat,
      });
      if (disposerAc === undefined) throw new Error("slots face unavailable");
    });
  };

  /** 单装形态：页型 + priority -10 独立任务概览 body + chip 标题段（project 缺席兜底）。 */
  const registerStandalone = (): void => {
    registerOverviewType();
    face(`${SIDEBAR_RIGHT_PANE_TAB_SLOT}:${DSWF_OVERVIEW_TAB_KIND}`, () => {
      disposerBody = registerKeyedSection(slots, {
        slot: SIDEBAR_RIGHT_PANE_TAB_SLOT,
        key: DSWF_OVERVIEW_TAB_KIND,
        locale: FORGE_TASK_LOOP_LOCALE_NS,
        priority: PRIORITY_TASK_LOOP_FALLBACK,
        inject: overviewInject,
        component: OverviewSeat,
      });
      if (disposerBody === undefined) throw new Error("slots face unavailable");
    });
    face(`${SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT}:${DSWF_OVERVIEW_TAB_KIND}`, () => {
      disposerTitle = registerKeyedSection(slots, {
        slot: SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT,
        key: DSWF_OVERVIEW_TAB_KIND,
        priority: PRIORITY_TASK_LOOP_FALLBACK,
        component: function OverviewTitleChip(): ReactNode {
          return <span>{t("tab.overview")}</span>;
        },
      });
      if (disposerTitle === undefined) throw new Error("slots face unavailable");
    });
  };

  /** dispose 当前代全部注册（幂等——官方 register 撤销器幂等语义）。 */
  const disposeOwn = (): void => {
    disposerType?.();
    disposerBody?.();
    disposerTitle?.();
    disposerAc?.();
    disposerType = undefined;
    disposerBody = undefined;
    disposerTitle = undefined;
    disposerAc = undefined;
  };

  /** 在场驱动重绑：现查裁决 → 形态不变零动作；切换 = dispose 当前代 + 落座新形态。 */
  const rebind = (): void => {
    const present = projectPresent();
    if (mode !== undefined && (mode === "integrated") === present) return;
    disposeOwn();
    if (present) {
      registerIntegrated();
      mode = "integrated";
    } else {
      registerStandalone();
      mode = "standalone";
    }
  };

  // apply 期首判落座（装载顺序无关）
  rebind();

  // slots.subscribe 订阅（官方 SlotCore——后到注册/卸载微任务批量通知驱动重绑；
  // 缺席 = fail-soft 停驻 apply 期快照形态）
  let unsubscribe: (() => void) | undefined;
  face("slots.subscribe:overview-rebind", () => {
    if (typeof ledger.subscribe !== "function") {
      throw new Error("ctx.slots.subscribe absent");
    }
    unsubscribe = ledger.subscribe(SIDEBAR_RIGHT_PANE_TAB_SLOT, rebind);
    if (unsubscribe === undefined) throw new Error("slots.subscribe returned no disposer");
  });

  // 订阅撤销器 + 当前代注册撤销器 wire 进 ctx.effect（插件卸载级联清理——裁决 1 实现纪律）
  ctx.effect?.(
    () => () => {
      unsubscribe?.();
      disposeOwn();
    },
    "overview: 双形态注册切换（subscribe 重绑订阅 + 注册撤销级联）",
  );

  // 第三段：文档资源型两段（1.45 形状随迁——multiple + patterns + canOpen 前缀防御；
  // 去重 = 地址本身；title = 地址尾段；body = docs-tab ForgeDocsTab[makeClient = Typert 适配]）
  face(DSWF_DOC_TAB_KIND, () => {
    if (tabs === undefined || typeof tabs.register !== "function") {
      throw new Error("ctx.sidebarRightTabs.register absent");
    }
    const disposeType = tabs.register({
      id: DSWF_DOC_TAB_KIND,
      kind: DSWF_DOC_TAB_KIND,
      multiple: true,
      patterns: [`${DSWF_DOC_ADDRESS_PREFIX}**`],
      canOpen: (address: string): boolean => address.startsWith(DSWF_DOC_ADDRESS_PREFIX),
      title: docTabTitle,
    });
    ctx.effect?.(() => (typeof disposeType === "function" ? disposeType : undefined), "dswf-doc: dock tab type");
  });
  face(`${SIDEBAR_RIGHT_PANE_TAB_SLOT}:${DSWF_DOC_TAB_KIND}`, () => {
    if (registerKeyedSection(slots, {
      slot: SIDEBAR_RIGHT_PANE_TAB_SLOT,
      key: DSWF_DOC_TAB_KIND,
      priority: PRIORITY_TASK_LOOP_FALLBACK,
      inject: () => ({ makeClient: typertRpcClientFactory }),
      component: ForgeDocsTab,
    }) === undefined) throw new Error("slots face unavailable");
  });

  return {
    registered,
    // mode = 双形态终态活投影（getter——subscribe 重绑后诊断/e2e 锚随终态更新）
    get mode(): DockTabsFormMode {
      return mode ?? "standalone";
    },
  };
}
