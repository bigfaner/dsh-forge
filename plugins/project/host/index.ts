// @dsh-forge/project —— host 入口占位（包骨架：域代码随迁移任务逐批落位）。
// 本文件当前只承担两件事：
//   ① loader 装载面：default 导出 Plugin.Function（cordis loader 只认 default 导出
//     函数，组合层经 cordis.patch.yml 单行 insert 挂载）；
//   ② bundle 管线验证锚：消费 @dsh-forge/lib-* devDependencies（scripts/bundle-host.mjs
//     构建期内联进 dist——产物自含），self-containment 测试据此外置/内联两侧断言；
//     域代码落位后本文件按提案 §二「目录布局」重组为装配入口。
import { errMessage } from "@dsh-forge/lib-util";

/** cordis 插件装载形态（loader 只认 default 导出函数）。 */
interface ProjectPlugin {
  (): void;
  inject: readonly string[];
}

const projectPlugin: ProjectPlugin = () => {};

// 骨架期零服务依赖；域装配落位后按域缝逐行声明。
projectPlugin.inject = [];

/**
 * 装配失败诊断投影（骨架期管线验证锚——lib-util errMessage 消费点，
 * 域代码落位后由域面替换）。
 */
export function describeSetupFailure(error: unknown): string {
  return errMessage(error);
}

export default projectPlugin;
