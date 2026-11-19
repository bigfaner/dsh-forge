// 文档 dock tab 装配体（1.13 自 @dsh-forge/project ui/dock-tabs 迁包——镜像自
// dock-tabs.tsx ForgeDocsTab + bug-refs/dock-tab-mirrors.ts 官方面切片；bundle 自含纪律：
// 零跨包 import）。挂载 = dock-tabs-face `sidebar.right.pane.tab` keyed 'dswf-doc' body
// （useTabInfo 由 seat 声明 inject 恒递达；makeClient = Typert 适配工厂——docs.read 通道
// 官方宿主缺席 = typed 错误相位不炸槽）。
import type { ReactNode } from "react";
import { EmptyState } from "../components.js";
import { type RpcClientFactory } from "./rpc-channels.js";
import { typertRpcClientFactory } from "./typert-transport.js";
import { DocsTab } from "./docs/index.js";

/** 文档 tab 类型 kind（plugin.ts DOC_TAB_KIND 结构同型镜像——字面量同源 pin） */
export const DSWF_DOC_TAB_KIND = "dswf-doc";
/** 文档 tab 资源地址前缀（dsh-resource:// 资源面——plugin.ts DOC_ADDRESS_PREFIX 同源镜像） */
export const DSWF_DOC_ADDRESS_PREFIX = `dsh-resource://${DSWF_DOC_TAB_KIND}/`;

/** 文档 tab 地址（= 去重键 contentId：同 projectId+docRel 同 tab、异地址新开） */
export function forgeDocAddress(projectId: string, docRel: string): string {
  return `${DSWF_DOC_ADDRESS_PREFIX}${projectId}/${docRel}`;
}

/** 文档 tab 地址解析（纯函数）：前缀 + `<projectId>/<docRel>`；形状非法 → null（占位面） */
export function parseForgeDocAddress(
  address: string,
): { readonly projectId: string; readonly docRel: string } | null {
  if (!address.startsWith(DSWF_DOC_ADDRESS_PREFIX)) return null;
  const rest = address.slice(DSWF_DOC_ADDRESS_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) return null;
  return { projectId: rest.slice(0, slash), docRel: rest.slice(slash + 1) };
}

/** 文档 tab 标题（地址尾段——镜像自 project session-actions docTabTitle，语义逐字不变） */
export function docTabTitle(address: string): string {
  const lastSlash = address.lastIndexOf("/");
  return lastSlash === -1 || lastSlash === address.length - 1 ? address : address.slice(lastSlash + 1);
}

/** 官方 tab 记录动作面窄面（SidebarRightTabActions 消费切片——结构同型镜像） */
export interface DockTabActionsMirror {
  openResource(address: string, options?: { readonly kind?: string }): void;
}

/** 官方 tab 记录窄面（TabRecord 消费切片——contentId = 资源地址） */
export interface DockTabRecordMirror {
  readonly kind: string;
  readonly contentId: string;
  readonly actions?: DockTabActionsMirror;
}

/** useTabInfo 钩子窄面（UseSidebarRightTabInfo 消费切片——seat inject 递达物） */
export interface UseDockTabInfoMirror {
  (): { readonly tab: DockTabRecordMirror };
}

/** tabInfo 读取子件（钩子形制：可选 tabInfo 钩子经子件无条件调用——在场性中途变化不漂移） */
export function TabInfoReader({
  hook,
  children,
}: {
  readonly hook: UseDockTabInfoMirror;
  readonly children: (info: { readonly tab: DockTabRecordMirror }) => ReactNode;
}): ReactNode {
  const info = hook();
  return children(info);
}

export interface ForgeDocsTabProps {
  /** 官方 tabInfo 钩子（seat inject 递达——contentId 读取源） */
  readonly useTabInfo?: UseDockTabInfoMirror;
  /** RPC client 构造器（缺省 Typert 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory;
}

/** 文档 dock tab body（地址解析 → DocsTab；形状非法 = 占位空态） */
export function ForgeDocsTab({ useTabInfo, makeClient = typertRpcClientFactory }: ForgeDocsTabProps): ReactNode {
  if (useTabInfo === undefined) return null;
  return (
    <TabInfoReader hook={useTabInfo}>
      {(info) => {
        const parsed = parseForgeDocAddress(info.tab.contentId);
        return parsed === null ? (
          <div data-dswf-doc-invalid="">
            <EmptyState
              className="dswf-ov-dock-empty"
              title="文档地址无效"
              description="该 tab 携带的文档地址无法解析——关闭后从概览重新打开。"
            />
          </div>
        ) : (
          <DocsTab projectId={parsed.projectId} docRel={parsed.docRel} makeClient={makeClient} />
        );
      }}
    </TabInfoReader>
  );
}
