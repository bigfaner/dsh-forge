// 锚定解析缺省绑定（装配缝——解析链本体在 dock-tabs/self-anchor.ts，零传输引用）：
// 归属裁决数据源 = 插件自有 worktree resolve 正典通路（ui/rpc Typert face——官方宿主可达，
// bug 52fc94db 后侧栏/概览同款单一通路；1.9 三处数据引用改接先例）。宿主半 = project.db
// 归属行 + workspaceRegistry 进程内直查（fix-11 已建身份裁决单点，Desktop 在场通路——
// 1.13/019 replica 探针实证 path→projectId 命中）。face 缺席/调用抛错原样上抛——解析链
// catch 收敛为 null fail-soft（self-anchor 既有语义），不在本缝静默。
import type { AnchorProjectResolver } from "./self-anchor.js";
import { createForgeRpcClient, type ForgeRpcClient } from "../rpc.js";

/**
 * 缺省归属解析缝：工作区原路径 → 插件 worktree resolve 批量通路（单路径调用，宿主半
 * 归一裁决）→ 归属项目 id；未注册（resolved 零行）= undefined。
 */
export function anchorProjectResolver(makeRpc: () => ForgeRpcClient = createForgeRpcClient): AnchorProjectResolver {
  return async (path: string) => {
    const result = await makeRpc().worktree.resolve({ paths: [path] });
    return result.resolved[0]?.projectId;
  };
}
