// panel/summon-session —— [召唤] 官方会话缝（返工 fix-9 裁决：复用既有官方 chat-view，
// 移除面板内自建消息 Modal）。[召唤] = 经官方缝打开/切换到猎头模式预设会话（PRD US14：
// 对猎头会话说需求 → 猎头调管理工具建档 → 面板经既有 fs/observed + 5s 轮询通道热
// 刷新联动——零新增旁路）。缝先例 = ShellHost.tsx openSessionWithPreset 编排
//（apps/web/src/client-plugin/open-session.ts 同构）：uiWorkspace.openWorkspace
//（reuse-or-create blank，beforeOpen 同步回传会话 id）→ remote.agentPresets.select
//（blank 会话首回合前重绑；猎头预设 id 对齐部署侧 preset-headhunter config.id = 'headhunter'
//——原 HR · 专家管理 2026-11-01 改名）。
//
// 绑定语义（裁决③ + formal-verifier 评审 2026-11-01）：召唤会话绑定「主视图会话锚及其
// 归属 workspace 行」——官方选中态真源 = 会话账本 `retainedBy.mainView`（UiWorkspaceService
// selection 的公开投影，官方 DocumentTitle / startSession currentWorkspaceId 同径），
// workspace 由会话归属派生（`items.find(ws => ws.sessionIds.includes(sessionId))`）。
// 主视图锚缺席（hero clearMain 语境）= 降级引导，不落任何派生启发式（判例 2026-10-24：
// 引导文案 > 猜测）；无锚且清单仅一个带 path 行 = 单库兜底。
//
// bundle 自含纪律：零运行时 import——上游服务面以结构同型窄接口承载（open-session.ts
// 同法）；服务解析（ctx.reflect 惰性取法）归装配壳（src-client/index.ts，调用期解析）。

/** 猎头模式预设 id（对齐部署侧 preset-headhunter 底稿 config.id——apps/host presets/headhunter.patch.yml）。 */
export const HEADHUNTER_PRESET_ID = "headhunter";

/** 官方 WorkspaceView 消费切片（workspace-controller client store 快照行窄面）。 */
export interface SummonWorkspaceRow {
  /** dsh 工作区 id（官方 openWorkspace 寻址面；缺席 = 归属解析不明 → 降级引导）。 */
  readonly workspaceId?: string;
  /** 工作区路径（面板 list 请求 workspace 参数同参同源——D4 取值径）。 */
  readonly path?: string;
}

/** 官方 workspace 归属快照窄形状（items 数组；形状漂移 = undefined）。 */
export interface SummonWorkspaceListSnapshot {
  readonly items?: readonly unknown[];
}

/** 官方会话账本快照窄形状（byId 表——retainedBy.mainView 为主视图锚公开投影）。 */
export interface SummonSessionsSnapshot {
  readonly byId?: Readonly<Record<string, { retainedBy?: { mainView?: number } } | undefined>>;
}

/** 从 list 快照取单库兜底行（仅唯一带 path 行时；多行/零行/形状漂移 = undefined——不猜）。 */
export function summonWorkspaceOf(snapshot: unknown): SummonWorkspaceRow | undefined {
  const items = (snapshot as SummonWorkspaceListSnapshot | undefined)?.items;
  if (!Array.isArray(items)) return undefined;
  const pathRows = (items as readonly SummonWorkspaceRow[]).filter(
    (row) => typeof row?.path === "string" && row.path !== "",
  );
  return pathRows.length === 1 ? pathRows[0] : undefined;
}

/** 主视图会话锚（retainedBy.mainView > 0 的会话 id；缺席/形状漂移 = undefined）。 */
export function mainViewSessionIdOf(snapshot: unknown): string | undefined {
  const byId = (snapshot as SummonSessionsSnapshot | undefined)?.byId;
  if (byId === undefined || typeof byId !== "object") return undefined;
  for (const [sessionId, summary] of Object.entries(byId)) {
    if ((summary?.retainedBy?.mainView ?? 0) > 0) return sessionId;
  }
  return undefined;
}

/**
 * 召唤绑定行推导（取值径单源）：主视图会话锚在场 → 归属 workspace 行（`sessionIds`
 * 包含锚的行；无匹配 = undefined——锚在场而归属不明时**不落兜底**，直接引导）；锚缺席
 * → 单库兜底（清单仅一个带 path 行——此时无更强锚，官方单库语境同形）。
 */
export function summonWorkspaceRowOf(
  sessions: unknown,
  workspaces: unknown,
): SummonWorkspaceRow | undefined {
  const anchor = mainViewSessionIdOf(sessions);
  if (anchor !== undefined) {
    const items = (workspaces as SummonWorkspaceListSnapshot | undefined)?.items;
    if (!Array.isArray(items)) return undefined;
    for (const row of items as readonly (SummonWorkspaceRow & { sessionIds?: readonly string[] })[]) {
      if (Array.isArray(row?.sessionIds) && row.sessionIds.includes(anchor)) return row;
    }
    return undefined;
  }
  return summonWorkspaceOf(workspaces);
}

/** agentPresets/select 远端结果（镜像上游 RemoteResult 判别联合消费面）。 */
export type SummonPresetSelectResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: { readonly message: string; readonly details?: { readonly reason?: string } } };

/** 官方服务窄面（上游 0.2.0-rc.2 结构同型镜像——open-session.ts OpenSessionPlatform 切片）。 */
export interface SummonPlatform {
  /** 连接工作区并打开其 blank 会话（reuse-or-create；beforeOpen 同步回传会话 id） */
  openWorkspace(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void>;
  /** 预设选择（blank 会话首回合前重绑——失败带原因文本） */
  selectPreset(sessionId: string, presetId: string): Promise<SummonPresetSelectResult>;
}

/** 召唤结果（阶段化失败——调用面降级引导呈现；失败不含半途撤销）。 */
export type SummonOutcome =
  | { readonly ok: true; readonly sessionId: string; readonly presetApplied: boolean }
  | { readonly ok: false; readonly stage: "workspace" | "create" | "preset"; readonly message: string };

/** 猎头预设缺席/被拒的阶段化降级引导（人话文案——裁决④；拒绝细节 console 留痕不直出）。 */
function presetRefusalMessage(result: SummonPresetSelectResult & { ok: false }): string {
  const reason = result.error.details?.reason ?? result.error.message;
  console.error(
    "[dsh-forge/expert-squad] headhunter preset select refused:",
    reason,
  );
  return "猎头模式预设切换被拒——请确认猎头模式预设（preset-headhunter）已装配后再试";
}

/**
 * [召唤] 编排（openSessionWithPreset 同构最小面——预填/自动发送不随本缝：US14 由用户
 * 在官方会话内对猎头说需求，零面板内对话面）。步序：workspace 锚守卫 → openWorkspace
 * （beforeOpen 回传会话 id；被后续导航取代 = 官方语义，按创建失败口径上报）→
 * agentPresets.select('headhunter')（被拒 = 降级引导文案）。会话打开失败 fail-soft：返回阶段化
 * 失败，调用面引导呈现，面板不炸。
 */
export async function openSummonSession(
  platform: SummonPlatform,
  workspace: SummonWorkspaceRow,
): Promise<SummonOutcome> {
  const { workspaceId } = workspace;
  if (typeof workspaceId !== "string" || workspaceId === "") {
    // 诊断面（summon-anchor）：主视图锚缺席或归属不明——引导文案面 + console 留痕
    // （client 束 console 豁免先例，summon-session.ts:65 同径）。
    console.warn("[dsh-forge/expert-squad] summon anchor absent/unresolved——降级引导（stage:workspace）");
    return {
      ok: false,
      stage: "workspace",
      message: "未找到当前打开的工作区——请先在官方工作台打开目标工作区后再寻访",
    };
  }
  let sessionId: string | undefined;
  try {
    await platform.openWorkspace(workspaceId, (id) => {
      sessionId = id;
    });
  } catch (error) {
    // Root cause（fix-14）：降级条直出原始错误文本（TypeError 原文）对用户不可读——
    // 阶段化人话文案呈现，原始错误细节 console.error 留痕。
    console.error("[dsh-forge/expert-squad] summon openWorkspace failed:", error);
    return {
      ok: false,
      stage: "create",
      message: "寻访会话打开失败，请稍后重试或检查工作区连接状态",
    };
  }
  if (sessionId === undefined) {
    return {
      ok: false,
      stage: "create",
      message: "寻访会话编排被后续导航取代（beforeOpen 未回传）",
    };
  }
  const id: string = sessionId;
  try {
    const result = await platform.selectPreset(id, HEADHUNTER_PRESET_ID);
    if (!result.ok) {
      return { ok: false, stage: "preset", message: presetRefusalMessage(result) };
    }
    return { ok: true, sessionId: id, presetApplied: true };
  } catch (error) {
    console.error("[dsh-forge/expert-squad] summon selectPreset failed:", error);
    return {
      ok: false,
      stage: "preset",
      message: "猎头模式预设切换失败，请稍后重试",
    };
  }
}
