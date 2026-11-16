// lib/api barrel（归并锚 plugin-project 1.7）：contracts DTO + 词汇/错误码/通道常量单源落位。
// 本体自 @dsh-forge/contracts git mv 迁入（零语义改动），contracts 旧位留 re-export 兼容面
// （消费方 import 面零改动；contracts 全量归并退役收口另有任务）。
// 定位：纯类型与纯常量，零逻辑零依赖（依赖铁律：运行期不依赖任何包）。
export * from './labels.js'
export * from './errors.js'
export * from './channels.js'
export * from './dto/bugs.js'
export * from './dto/forge.js'
export * from './dto/fs.js'
export * from './dto/knowledge.js'
export * from './dto/project.js'
export * from './dto/rpc.js'
export * from './dto/worktree.js'
export * from './ports.js'
// tool 面共享原语（plugin-spec 1.4 下沉单源：format 双友好模板 + args 防御收窄 +
// forge-paths 路径派生常量——插件 tool 层统一经本单源消费，禁插件间互拷）
export * from './tools/format.js'
export * from './tools/args.js'
export * from './tools/forge-paths.js'
