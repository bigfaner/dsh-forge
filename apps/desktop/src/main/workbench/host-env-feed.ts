// workbench/host-env-feed — 壳侧 env 投喂(任务 6.1,5.gate 非阻塞项回填)。
//
// 4.1 定形的 ForgeBridge 跨进程依赖缝:插件 host 半身按调用读
// `DSH_FORGE_PROJECT_ROOTS`(JSON 字符串数组,已注册项目 code_root 允许表,
// 缺失/非法 → 空表 fail-closed)。host 子进程经 spawn 继承 Electron 主进程
// env(host-supervisor 不传 env),所以「壳在 host spawn 前刷新该变量」即整条
// 投喂链 —— tech-design Interface 2 与 host/index.ts 头注释的既定契约
// (「refreshed by the shell at host spawn from the workbench projects table」)。
//
// 优先序(Hard:显式 env 覆盖生产投喂 —— 测试档案通道):
//   值未设置/为空,或等于本 feeder 上一次投喂值 → 用 projects 表当前值覆写
//   (空表写 `[]`,与缺失同义 fail-closed);值被外部显式改写(≠ 上一次投喂
//   值)→ 保持不动。这样每次 startHost(首启 + 恢复重启)都重投自己上轮的
//   值,而 5.11 leg B 式的显式设置仍稳赢。
//
// `DSH_FORGE_CLI_PATH`(设置显式路径 override)无持久化设置源(工作台设置
// 存储是后续 feature 面),env 直通已由继承达成:外部显式设置即生效,壳侧
// 不覆写。

/**
 * The ForgeBridge allowlist transport name (mirrors the plugin host half's
 * constant — kept literal so the app never imports plugin internals).
 */
export const HOST_PROJECT_ROOTS_ENV = 'DSH_FORGE_PROJECT_ROOTS'

/**
 * Create the per-process host env feeder (call before EVERY host spawn).
 *
 * @param env - env bag written in place (default: the Electron main
 * process's `process.env`, which every host spawn inherits).
 * @returns the feed function; each call returns the value now in effect.
 */
export function createHostSpawnEnvFeeder(env: Record<string, string | undefined> = process.env): (roots: readonly string[]) => string {
  let lastFed: string | undefined
  return (roots: readonly string[]): string => {
    const current = env[HOST_PROJECT_ROOTS_ENV]
    if (current !== undefined && current !== '' && current !== lastFed) return current
    const value = JSON.stringify([...roots])
    env[HOST_PROJECT_ROOTS_ENV] = value
    lastFed = value
    return value
  }
}
