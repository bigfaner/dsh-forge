// panel —— 专家卡片网格主视图出口（ui-design F1 产品实现）。
// 视图 = ExpertPanelApp（官方 main keyed 槽占用者）；纯逻辑/数据源/样式分模块单测直测。
import type { ReactNode } from "react";
import { ensurePanelStyles } from "./styles.js";

export {
  filterExperts,
  footerText,
  matchesQuery,
  personaSummary,
  updatedLabel,
  type ExpertView,
  type StatusFilter,
} from "./filter.js";
export {
  ExpertListController,
  PANEL_POLL_MS,
  type ListFetcher,
  type ListPhase,
  type ListState,
} from "./list-source.js";
export {
  defaultListFetcher,
  defaultDetailMutations,
  ExpertPanel,
  ExpertPanelApp,
  listUrl,
  workspacePathOf,
  type ExpertPanelAppProps,
  type ExpertPanelProps,
  type WorkspacesHook,
} from "./expert-panel.js";
export {
  addSkill,
  DESCRIPTION_MAX,
  draftOf,
  hasBareMustache,
  mdInline,
  personaBlocks,
  TOOL_CANDIDATES,
  toggleInList,
  unionSkills,
  validateDraft,
  type ExpertDraft,
  type MdBlock,
  type MdInline,
} from "./detail-logic.js";
export {
  ExpertDetailController,
  type DetailMode,
  type DetailMutations,
  type DetailState,
} from "./detail-source.js";
export {
  ExpertDetailDialog,
  type AllSkills,
} from "./detail-dialog.js";
export {
  deriveRecruit,
  recruitTitle,
  recruitTools,
  receiptText,
  errorText,
  thinkingText,
  OPENING_GUIDE,
  RECEIPT_REF,
} from "./summon-logic.js";
export {
  SummonChatController,
  type SummonCreator,
  type SummonMessage,
  type SummonState,
} from "./summon-source.js";
export { SummonDialog } from "./summon-dialog.js";

/**
 * 面板行字形（官方 sidebar.panellist 占用者 owner props = { size, active }——
 * KnowledgeGlyph 同型镜像）。字形暂以「专」文本承载——官方 IconUsersOutlineRegular
 * 消费需 primitives barrel（内联 CSS-modules 打片面）接入，归装配走查任务收口。
 */
export function ExpertPanelGlyph({ size }: { readonly size?: number; readonly active?: boolean }): ReactNode {
  ensurePanelStyles();
  return (
    <span
      style={{
        fontSize: size ?? 16,
        lineHeight: 1,
      }}
    >
      专
    </span>
  );
}
