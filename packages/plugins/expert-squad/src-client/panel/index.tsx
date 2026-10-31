// panel —— 专家卡片网格主视图出口（ui-design F1 产品实现）。
// 视图 = ExpertPanelApp（官方 main keyed 槽占用者）；纯逻辑/数据源/样式分模块单测直测。
import { IconUsersOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReactNode } from "react";
import { ensurePanelStyles } from "./styles.js";

export { ExpertIcon } from "./expert-icon.js";

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
  defaultCatalogProbe,
  candidatesUrl,
  ExpertPanel,
  ExpertPanelApp,
  listUrl,
  workspaceRowOf,
  type CandidateCatalogSnapshot,
  type ExpertPanelAppProps,
  type ExpertPanelProps,
  type SummonOpener,
  type WorkspacesHook,
} from "./expert-panel.js";
export {
  addSkill,
  DESCRIPTION_MAX,
  draftOf,
  hasBareMustache,
  mdInline,
  personaBlocks,
  skillCandidatesOf,
  TOOL_CANDIDATES,
  toolCandidatesOf,
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
  HR_PRESET_ID,
  openSummonSession,
  summonWorkspaceOf,
  type SummonOutcome,
  type SummonPlatform,
  type SummonPresetSelectResult,
  type SummonWorkspaceRow,
} from "./summon-session.js";
export {
  modelCatalogLoaderOf,
  modelCatalogOfEnvelope,
  providerOptionsOf,
  modelOptionsOf,
  INHERIT_OPTION,
  type ModelCatalogEntry,
  type ModelCatalogLoader,
} from "./model-catalog.js";

/**
 * 面板行字形（官方 sidebar.panellist 占用者 owner props = { size, active }——
 * KnowledgeGlyph 同型镜像）。官方 IconUsersOutlineRegular（primitives barrel，
 * 与个体 User 成对——提案 §2.2-9 收口，「专」文本占位退役）。
 */
export function ExpertPanelGlyph({ size }: { readonly size?: number; readonly active?: boolean }): ReactNode {
  ensurePanelStyles();
  return <IconUsersOutlineRegular size={size ?? 16} />;
}
