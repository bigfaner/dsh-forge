// bug tools 会话上下文解析（plugin-project bug 写径工具面——task-loop tools/session.ts
// 同型窄化平移：本插件只消费 sessionId + cwd 两键，零绑定表机制——cwd → projectId
// 归一走装配面注入 resolver，归一化口径（normalizeFsPath）在装配面单源承担）。

/** tool 执行上下文（官方 ToolRunContext 结构兼容子面——只消费 agent.session） */
export interface BugToolExecFace {
  readonly agent?: unknown;
}

/** 会话上下文（tool 执行点可解析的全部会话身份——record/resolve 两写径落 session 键） */
export interface BugToolSessionContext {
  /** dsh 会话 id（无 agent 上下文 = 空串） */
  readonly sessionId: string;
  /** 会话工作区根（官方 session.header.cwd）；非 agent 调用无此值 */
  readonly cwd: string | undefined;
}

/** cwd → projectId 解析器（装配面注入——own db 行派生 / projectResolution 缝退路；可异步） */
export type BugProjectIdResolver = (cwd: string) => string | undefined | Promise<string | undefined>;

/** ERR_WORKSPACE_NOT_REGISTERED 附载（code 字面量锚 lib/api ERROR_CODES） */
export interface WorkspaceNotRegisteredData {
  readonly cwd?: string;
}

/** tool 面 cwd 无匹配项目（typed——callToolFace 面以 code 判别；本工具面直抛原样透出） */
export class WorkspaceNotRegisteredError extends Error {
  readonly code = "ERR_WORKSPACE_NOT_REGISTERED" as const;
  readonly data: WorkspaceNotRegisteredData;

  constructor(data: WorkspaceNotRegisteredData) {
    super(
      data.cwd === undefined
        ? "bug tools: no session workspace in this call context — the forge project cannot be located"
        : `bug tools: workspace ${data.cwd} is not bound to a registered project`,
    );
    this.name = "WorkspaceNotRegisteredError";
    this.data = data;
  }
}

/** exec → 会话上下文（官方读取位 header.cwd；顶层 cwd 为结构兼容位——task-loop 同径） */
export function sessionContextOf(exec: BugToolExecFace): BugToolSessionContext {
  const session = (exec.agent as { session?: { id?: unknown; header?: { cwd?: unknown }; cwd?: unknown } } | undefined)
    ?.session;
  if (session === undefined) return { sessionId: "", cwd: undefined };
  const cwd = typeof session.header?.cwd === "string" ? session.header.cwd : typeof session.cwd === "string" ? session.cwd : undefined;
  return { sessionId: typeof session.id === "string" ? session.id : "", cwd };
}

/** 会话 → projectId（bug 四 tool 共用路由口；cwd 缺席或 resolver 未命中 → typed 拒）。
 *  cwd 原样直传 resolver——归一化口径（大小写/分隔符）由装配面单源承担。 */
export async function requireProjectId(resolver: BugProjectIdResolver, session: BugToolSessionContext): Promise<string> {
  if (session.cwd === undefined) throw new WorkspaceNotRegisteredError({});
  const projectId = await resolver(session.cwd);
  if (projectId === undefined) throw new WorkspaceNotRegisteredError({ cwd: session.cwd });
  return projectId;
}

/** 会话 → 执行会话 id（report/fix session 写源键；无 agent 会话 = undefined——键缺席降级） */
export function optionalSessionId(session: BugToolSessionContext): string | undefined {
  return session.sessionId === "" ? undefined : session.sessionId;
}
