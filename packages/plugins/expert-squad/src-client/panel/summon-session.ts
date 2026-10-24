// panel/summon-session —— [召唤] 官方会话缝（返工 fix-9 裁决：复用既有官方 chat-view，
// 移除面板内自建消息 Modal）。[召唤] = 经官方缝打开/切换到 HR 预设会话（PRD US14：
// 对 HR 预设会话说需求 → HR 调管理工具建档 → 面板经既有 fs/observed + 5s 轮询通道热
// 刷新联动——零新增旁路）。缝先例 = ShellHost.tsx openSessionWithPreset 编排
//（apps/web/src/client-plugin/open-session.ts 同构）：uiWorkspace.openWorkspace
//（reuse-or-create blank，beforeOpen 同步回传会话 id）→ remote.agentPresets.select
//（blank 会话首回合前重绑；HR 预设 id 对齐 1.23 装配的部署侧 preset-hr config.id = 'hr'）。
//
// 绑定语义（裁决③）：召唤会话默认绑定用户当前打开的工作区——workspace 锚 = 官方
// workspace-controller client store 快照中当前选中 WorkspaceView 行（与面板 list 请求的
// workspace 参数同参同源，D4 一致性，summonWorkspaceOf = 面板 workspaceRowOf 取值径同源）；
// 绑定动作 = openWorkspace(workspaceId) 官方一体面（连接工作区并开会话）。
// dsh-forge（worktree 形态工作区）的 workspace → 项目归属解析由 host 单点保证
//（AGENTS 1.1 正确性 host 单点；bug 52fc94db worktree 锚定判例 + ShellHost
// useWorkspaceProjectMap 同源管线）——客户端不复制归属裁决，只递达 workspaceId。
// 归属解析不明（锚行无 workspaceId）= 降级引导（stage:'workspace'），不弹选择器、
// 不空绑定、不炸面板。
//
// bundle 自含纪律：零运行时 import——上游服务面以结构同型窄接口承载（open-session.ts
// 同法）；服务解析（ctx.reflect 惰性取法）归装配壳（src-client/index.ts，调用期解析）。

/** HR 预设 id（对齐 1.23 部署侧 preset-hr 底稿 config.id——apps/host presets/hr.patch.yml）。 */
export const HR_PRESET_ID = "hr";

/** 官方 WorkspaceView 消费切片（workspace-controller client store 快照行窄面）。 */
export interface SummonWorkspaceRow {
  /** dsh 工作区 id（官方 openWorkspace 寻址面；缺席 = 归属解析不明 → 降级引导）。 */
  readonly workspaceId?: string;
  /** 工作区路径（面板 list 请求 workspace 参数同参同源——D4 取值径）。 */
  readonly path?: string;
}

/** 官方 workspace 归属快照窄形状（items 数组；形状漂移 = undefined）。 */
export function summonWorkspaceOf(snapshot: unknown): SummonWorkspaceRow | undefined {
  const items = (snapshot as { items?: readonly unknown[] } | undefined)?.items;
  if (!Array.isArray(items)) return undefined;
  for (const row of items as readonly SummonWorkspaceRow[]) {
    if (typeof row?.path === "string" && row.path !== "") return row;
  }
  return undefined;
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

/** HR 预设缺席/被拒的阶段化降级引导（人话文案——裁决④；拒绝细节 console 留痕不直出）。 */
function presetRefusalMessage(result: SummonPresetSelectResult & { ok: false }): string {
  const reason = result.error.details?.reason ?? result.error.message;
  console.error(
    "[dsh-forge/expert-squad] HR preset select refused:",
    reason,
  );
  return "HR 预设切换被拒——请确认 HR · 专家管理预设（preset-hr）已装配后再试";
}

/**
 * [召唤] 编排（openSessionWithPreset 同构最小面——预填/自动发送不随本缝：US14 由用户
 * 在官方会话内对 HR 说需求，零面板内对话面）。步序：workspace 锚守卫 → openWorkspace
 * （beforeOpen 回传会话 id；被后续导航取代 = 官方语义，按创建失败口径上报）→
 * agentPresets.select('hr')（被拒 = 降级引导文案）。会话打开失败 fail-soft：返回阶段化
 * 失败，调用面引导呈现，面板不炸。
 */
export async function openSummonSession(
  platform: SummonPlatform,
  workspace: SummonWorkspaceRow,
): Promise<SummonOutcome> {
  const { workspaceId } = workspace;
  if (typeof workspaceId !== "string" || workspaceId === "") {
    return {
      ok: false,
      stage: "workspace",
      message: "未找到当前打开的工作区——请先在官方工作台打开目标工作区后再召唤",
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
      message: "召唤会话打开失败，请稍后重试或检查工作区连接状态",
    };
  }
  if (sessionId === undefined) {
    return {
      ok: false,
      stage: "create",
      message: "召唤会话编排被后续导航取代（beforeOpen 未回传）",
    };
  }
  const id: string = sessionId;
  try {
    const result = await platform.selectPreset(id, HR_PRESET_ID);
    if (!result.ok) {
      return { ok: false, stage: "preset", message: presetRefusalMessage(result) };
    }
    return { ok: true, sessionId: id, presetApplied: true };
  } catch (error) {
    console.error("[dsh-forge/expert-squad] summon selectPreset failed:", error);
    return {
      ok: false,
      stage: "preset",
      message: "HR 预设切换失败，请稍后重试",
    };
  }
}
