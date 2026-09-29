// windows — 壳层窗口域 barrel(任务 4.2;tech-design §Architecture·Layer
// Placement「壳窗口」行)。分层:channels(通道白名单,纯常量)← registry
// (主窗 + detached 集记账)← role(windowGetRole 供给)/ detached(开/收回
// 编排 + 安全接线)/ events-fanout(逐 webContents 推送)← ipc(动词注册,
// sender 校验 + 形状校验 + 域错误封装)。Electron 构造点唯一落位 =
// 壳引导(apps/desktop/src/main/index.ts)。

export * from './channels.ts'
export * from './registry.ts'
export * from './role.ts'
export * from './detached.ts'
export * from './events-fanout.ts'
export * from './ipc.ts'
