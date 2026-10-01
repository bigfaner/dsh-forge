// @dsh-forge/contracts —— 跨工件类型/常量（定位：基础·契约层；零逻辑零依赖）。
// 共享类型唯一源（依赖铁律④）：RPC DTO / 双服务方法签名 / frontmatter 契约常量 / 六错误码 /
// IPC 通道名——web 与 core/host 两侧各自引包，防 schema 漂移。
// 任何通道/DTO 变更 = 三处一体（contracts → web/rpc → core 对应域），禁单侧私改。
export * from './channels.js'
export * from './errors.js'
export * from './frontmatter.js'
export * from './dto/knowledge.js'
export * from './dto/project.js'
export * from './dto/rpc.js'
