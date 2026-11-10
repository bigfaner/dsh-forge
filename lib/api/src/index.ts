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
