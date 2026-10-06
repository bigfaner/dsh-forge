// 运行时包集合（S1 实测约束 2 的机械落实；定位：基础）。
// published @deepseek-ai/dsh 的依赖闭包不足：web profile 组合的插件包以 peerDependencies
// 声明能力包，须由安装侧（apps/host 依赖树 = installAnchor 树）供应。
// 本清单 = 官方组合 peer 闭包（S1 spike 实测 19+ 包）∪ boot/API 面（dsh-app-boot /
// dsh/profile-boot / dsh-client-connection / dsh-host-webserver——后两者兼作 ctx 类型增强）。
// 漂移守卫：runtime-packages.test.ts pin 本清单与 apps/host/package.json 精确一致。
export const RUNTIME_PACKAGES: Readonly<Record<string, string>> = {
  // —— dsh 公开栈（全部精确 pin 0.2.0-rc.2，P1 不开升级窗口）——
  '@deepseek-ai/dsh': '0.2.0-rc.2',
  '@deepseek-ai/dsh-anonymous-user-id': '0.2.0-rc.2',
  '@deepseek-ai/dsh-app-boot': '0.2.0-rc.2',
  '@deepseek-ai/dsh-attachment': '0.2.0-rc.2',
  '@deepseek-ai/dsh-client-connection': '0.2.0-rc.2',
  '@deepseek-ai/dsh-compaction': '0.2.0-rc.2',
  '@deepseek-ai/dsh-deepseek-account': '0.2.0-rc.2',
  '@deepseek-ai/dsh-fs': '0.2.0-rc.2',
  '@deepseek-ai/dsh-home-paths': '0.2.0-rc.2',
  '@deepseek-ai/dsh-host-webserver': '0.2.0-rc.2',
  '@deepseek-ai/dsh-jobs': '0.2.0-rc.2',
  '@deepseek-ai/dsh-launch-environment': '0.2.0-rc.2',
  '@deepseek-ai/dsh-llm-deepseek': '0.2.0-rc.2',
  '@deepseek-ai/dsh-output-retention': '0.2.0-rc.2',
  '@deepseek-ai/dsh-ptc-runtime': '0.2.0-rc.2',
  '@deepseek-ai/dsh-sandbox': '0.2.0-rc.2',
  '@deepseek-ai/dsh-session-persistence': '0.2.0-rc.2',
  '@deepseek-ai/dsh-session-query': '0.2.0-rc.2',
  '@deepseek-ai/dsh-session-telemetry': '0.2.0-rc.2',
  '@deepseek-ai/dsh-session-title-llm': '0.2.0-rc.2',
  '@deepseek-ai/dsh-shell': '0.2.0-rc.2',
  '@deepseek-ai/dsh-spill': '0.2.0-rc.2',
  '@deepseek-ai/dsh-subagent-in-process-driver': '0.2.0-rc.2',
  '@deepseek-ai/dsh-system-prompt': '0.2.0-rc.2',
  '@deepseek-ai/dsh-util-time': '0.2.0-rc.2',
  '@deepseek-ai/dsh-workflow': '0.2.0-rc.2',
  '@deepseek-ai/dsh-workspace': '0.2.0-rc.2',
  // —— Cordis 运行时（Loader 树加载机制四件）——
  '@deepseek-ai/cordis': '4.0.4',
  '@deepseek-ai/cordis-plugin-group': '1.0.4',
  '@deepseek-ai/cordis-plugin-include': '1.0.9',
  '@deepseek-ai/cordis-plugin-loader': '1.0.5',
}

/**
 * 产品插件闭包（3.4 M2——运行时闭包增员）。@dsh-forge/plugin-forge 三供应面：
 *   · dev 锚树：apps/host/package.json dependencies workspace 链接（本清单同门供应面
 *     ——paths.ts resolvePluginSkillsDir 亦自此解析 skills 目录）；
 *   · dev profile 树：apps/host/profile.dev/package.json link 行（loader 行 import 锚）；
 *   · 打包形态：scripts/assemble-installer-resources.mjs PRODUCT_PACKAGES 自 packages/
 *     真实拷贝（package.json + dist + skills——技能面物理挂载源）入 runtime/node_modules。
 * 不入 RUNTIME_PACKAGES 映射：该池 = npm 精确 pin 闭包（profile.install 消费——
 * installer-pipeline pin 禁声明 @dsh-forge/*，无 npm 分发形态）。
 */
export const PRODUCT_PLUGIN_PACKAGES: readonly string[] = ['@dsh-forge/plugin-forge']
