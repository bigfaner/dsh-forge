// @dsh-forge/path-key —— 【退役待删】（plugin-project 1.6 归并：单源已迁 @dsh-forge/lib-path，
// 见 .forge/docs/proposals/plugin-project/lib-merge-plan.md path-key 映射清单）。
// 本文件降为 re-export 兼容面：knowledge / plugin-forge / plugin-forge-spec / host 等未迁移
// 消费方（import '@dsh-forge/path-key'）保持编译与运行等价；退役删除任务到达时随消费方
// 改指 '@dsh-forge/lib-path/path-key' 一并收口。零本地实现残留。
export {
  isWindowsStylePath,
  joinDirSegment,
  normalizeDirPath,
  normalizeDirSpelling,
  normalizeFsPath,
} from '@dsh-forge/lib-path/path-key'
