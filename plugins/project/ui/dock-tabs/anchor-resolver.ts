// 锚定解析缺省绑定（装配缝——解析链本体在 dock-tabs/self-anchor.ts，零传输引用）：
// 归属裁决双径（bug 84acf85c 环3 定谳）：
//   ① worktree resolve 正典通路（git 身份归并——树会话径；ui/rpc Typert face——官方宿主可达，
//     bug 52fc94db 后侧栏/概览同款单一通路）；命中即短路。
//   ② project.db 归属行径（forgeProjects.list wsPath canonical 匹配——非 git 注册项目的
//     主工作区：git 中心链 rev-parse+tasksHome 目录名匹配对纯目录恒 unattached，本径补位；
//     self-anchor「宿主半 project.db 归属行」设计声明的落地）。archived 行不参与归属。
// 宿主半 = project.db 归属行 + workspaceRegistry 进程内直查（fix-11 已建身份裁决单点）。
// face 缺席/调用抛错原样上抛或降级下径——解析链 catch 收敛为 null fail-soft（self-anchor
// 既有语义），不在本缝静默。
import type { AnchorProjectResolver } from "./self-anchor.js";
import { createForgeRpcClient, type ForgeRpcClient } from "../rpc.js";

/** Windows 路径 canonical 投影（客户端窄读——宿主半归一前的对账键；lib-path f 单源同判据） */
function canonicalPathOf(path: string): string {
  return path.replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase();
}

/**
 * 缺省归属解析缝：工作区原路径 → ① worktree resolve（git 径，命中短路）→ ② project.db
 * 归属行（wsPath canonical 匹配，archived 行排除）→ 归属项目 id；双径皆未命中 = undefined。
 */
export function anchorProjectResolver(makeRpc: () => ForgeRpcClient = createForgeRpcClient): AnchorProjectResolver {
  return async (path: string) => {
    const client = makeRpc();
    try {
      const result = await client.worktree.resolve({ paths: [path] });
      const projectId = result.resolved[0]?.projectId;
      if (projectId !== undefined && projectId !== "") return projectId;
    } catch {
      // git 径失败 → ledger 径兜底（self-anchor 链 catch 收敛 fail-soft 语义）
    }
    const rows = await client.projects.list();
    const key = canonicalPathOf(path);
    const hit = rows.find(
      (row) => !row.archived && canonicalPathOf(row.wsPath) === key,
    );
    return hit?.id;
  };
}
