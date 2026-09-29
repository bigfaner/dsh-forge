// workbench/ui-state — 布局记忆域 barrel(任务 4.1;Interface 4 schema 权威
// + project_ui_state 仓储;动词装配 = ipc/services.ts,漂移锁 =
// apps/desktop/tests/workbench-ui-state.spec.ts)。分层:layout-schema
// (ProjectLayout v1 白名单校验,纯函数)← ui-state-repo(project_ui_state
// 读写,单写者)。

export * from './layout-schema.ts'
export * from './ui-state-repo.ts'
