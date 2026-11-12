// panel —— 专家卡片网格主视图出口（ui-design F1 产品实现）。
// 视图 = ExpertPanelApp（官方 main keyed 槽占用者）；纯逻辑/数据源/样式分模块
// 单测直测（深路径 import）——本出口仅收 ui/index.ts 的装配消费面。
import { IconUsersOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReactNode } from "react";
import { ensurePanelStyles } from "./styles.js";

export { ExpertPanelApp, type SummonOpener } from "./expert-panel.js";

/**
 * 面板行字形（官方 sidebar.panellist 占用者 owner props = { size, active }——
 * KnowledgeGlyph 同型镜像）。官方 IconUsersOutlineRegular（primitives barrel，
 * 与个体 User 成对——提案 §2.2-9 收口，「专」文本占位退役）。
 */
export function ExpertPanelGlyph({ size }: { readonly size?: number; readonly active?: boolean }): ReactNode {
  ensurePanelStyles();
  return <IconUsersOutlineRegular size={size ?? 16} />;
}
