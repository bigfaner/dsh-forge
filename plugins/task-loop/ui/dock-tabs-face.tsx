// dock tab 族注册面（1.13——概览 tab 改造版随六组件迁批落位 task-loop 包）：
// 两段注册（官方口径「adding a type is a registration, never an edit」）：
//   第一段 = sidebarRightTabs.register 页型 `dswf-overview`（guide 入口卡 order 0——官方
//     files/terminal/browser = 10/20/30 排最前）；
//   第二段 = `sidebar.right.pane.tab` keyed `dswf-overview` body（组件 = 本包 overview/
//     OverviewTab——提案/feature 子块已摘、主指标 = AC 核销进度）。
// projectKey 解析 = 页内 workbench 桥缝（`__DSH_FORGE_WORKBENCH__` overview.projectId——
// inject 期现查不缓存，缺席 = 「无任务数据」降级呈现不报错）；数据通道 = forgeTasks
// Typert namespace（makeClient 注入真身，缺席 = 调用期诚实降级）。
// 逐面 try/catch fail-soft（单面异常只降本面，console.warn 留痕不炸装配）。
import { useEffect, useState, type ReactNode } from "react";
import { OverviewTab } from "./overview/overview-tab.js";
import { createForgeTasksClient, type ForgeTasksClientFactory } from "./tasks-rpc.js";
import { DSWF_DOC_ADDRESS_PREFIX, DSWF_DOC_TAB_KIND, docTabTitle, ForgeDocsTab } from "./dock-tabs/docs-tab.js";
import { typertRpcClientFactory } from "./dock-tabs/typert-transport.js";
import { SIDEBAR_RIGHT_PANE_TAB_SLOT, type OfficialSeamCtx } from "./official-seams.js";
import { registerKeyedSection, type SectionSlotsFace } from "./keyed-section.js";
import { FORGE_TASK_LOOP_LOCALE_NS, type LocaleServiceFace } from "./locale.js";

/** task-loop 概览 tab 类型 kind（注册键 = keyed body dispatch 键——字面量单源） */
export const DSWF_OVERVIEW_TAB_KIND = "dswf-overview";

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

/** 桥快照 → 项目键投影（overview.projectId 窄读——缺席 = undefined） */
export function bridgeProjectKeyOf(bridge: WorkbenchBridgeMirror | undefined): string | undefined {
  if (bridge === undefined) return undefined;
  const overview = bridge.getSnapshot()["overview"];
  if (typeof overview !== "object" || overview === null) return undefined;
  const projectId = (overview as Record<string, unknown>)["projectId"];
  return typeof projectId === "string" && projectId !== "" ? projectId : undefined;
}

/** 概览 seat 组件（keyed body——projectKey 经桥缝订阅解析，缺席降级「无任务数据」） */
export function OverviewSeat(props: {
  readonly projectKeyOf?: () => string | undefined;
  readonly makeClient?: ForgeTasksClientFactory;
  readonly bridge?: WorkbenchBridgeMirror;
}): ReactNode {
  const resolve = props.projectKeyOf ?? (() => bridgeProjectKeyOf(props.bridge));
  const [projectKey, setProjectKey] = useState<string | undefined>(resolve());
  useEffect(() => {
    const bridge = props.bridge ?? workbenchBridgeOf();
    if (bridge === undefined) return;
    setProjectKey(resolve());
    return bridge.subscribe(() => setProjectKey(resolve()));
    // resolve 闭包随 props 稳定（调用方保证——face 工厂单次装配）
  }, [props.bridge, props.projectKeyOf]);
  return <OverviewTab projectKey={projectKey} {...(props.makeClient !== undefined ? { makeClient: props.makeClient } : {})} />;
}

/** 注册面诊断（registered = 实际落座面；e2e/排障锚） */
export interface DockTabsFaceDiagnostics {
  readonly registered: string[];
}

/**
 * dock tab 族注册（apply 编排）：页型类型定义 + keyed body 两面，逐面 fail-soft。
 * locale 缺席 = title 回退 NS 键名呈现（注册不阻断）。
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

  // 第一段：概览页型 + guide 入口卡 order 0（官方入口卡 10/20/30——升序排最前）
  face(DSWF_OVERVIEW_TAB_KIND, () => {
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
    ctx.effect?.(() => (typeof disposeType === "function" ? disposeType : undefined), "dswf-overview: dock tab type");
  });

  // 第二段：概览 keyed body（apply 期无条件注册——tab 骨架恒在，注册不绑数据服务；
  // projectKey/makeClient 经 inject face 挂载点现查，缺席 = 「无任务数据」降级呈现）
  face(`${SIDEBAR_RIGHT_PANE_TAB_SLOT}:${DSWF_OVERVIEW_TAB_KIND}`, () => {
    if (registerKeyedSection(slots, {
      slot: SIDEBAR_RIGHT_PANE_TAB_SLOT,
      key: DSWF_OVERVIEW_TAB_KIND,
      locale: FORGE_TASK_LOOP_LOCALE_NS,
      inject: () => {
        const bridge = workbenchBridgeOf();
        return {
          // projectKey 随桥快照订阅解析（桥缺席 = undefined——组件空态呈现不报错）
          ...(bridge !== undefined ? { bridge } : {}),
          // 数据通道真身（forgeTasks Typert namespace——face 缺席调用期诚实降级）
          makeClient: createForgeTasksClient as ForgeTasksClientFactory,
        };
      },
      component: OverviewSeat,
    }) === undefined) throw new Error("slots face unavailable");
  });

  // 文档资源型两段（1.45 形状随迁——multiple + patterns + canOpen 前缀防御；去重 = 地址本身；
  // title = 地址尾段；body = docs-tab ForgeDocsTab[makeClient = Typert 适配]）
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
      inject: () => ({ makeClient: typertRpcClientFactory }),
      component: ForgeDocsTab,
    }) === undefined) throw new Error("slots face unavailable");
  });

  return { registered };
}
