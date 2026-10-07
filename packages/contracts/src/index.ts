// @dsh-forge/contracts —— 跨工件类型/常量（定位：基础·契约层；零逻辑零依赖）。
// 共享类型唯一源（依赖铁律④）：RPC DTO / 双服务方法签名 / frontmatter 契约常量 / 六错误码 /
// IPC 通道名——web 与 core/host 两侧各自引包，防 schema 漂移。
// 任何通道/DTO 变更 = 三处一体（contracts → web/rpc → core 对应域），禁单侧私改。
// M2（1.1）：forge 四域 DTO（dto/forge.ts）+ 词汇中英标签（labels.ts）+ XML 标签集（xml-tags.ts）
// + 错误码扩池 15 新码 + 通道常量五族。
// M3（1.1）：容器双轨 DTO 改写（ContainerRef/mode 快照/forgeSettings/事件两层联合）+
// worker 收窄矩阵（worker-matrix.ts）+ 错误码 ×3 + 通道扩池（settings/proposals 三键）。
export * from './channels.js'
export * from './errors.js'
export * from './frontmatter.js'
export * from './labels.js'
export * from './worker-matrix.js'
export * from './xml-tags.js'
export * from './dto/forge.js'
export * from './dto/fs.js'
export * from './dto/knowledge.js'
export * from './dto/project.js'
export * from './dto/rpc.js'
