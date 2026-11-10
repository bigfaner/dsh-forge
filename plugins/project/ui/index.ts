// @dsh-forge/project —— client face 占位（包骨架：UI 面随迁移任务逐批落位）。
// 组合 cordis 插件形态（无 apply → 真机 `invalid plugin` 判例——expert-squad
// annotator gotcha-web-boot 同径）；apply 返回值铁律：必须返回 undefined
// （cordis 组合把返回值当 effect 消费）。
export const projectClient = {
  // 骨架期零服务消费；UI 面落位后按缝逐行声明（slots/configForms 等）。
  inject: [] as string[],
  apply(_ctx: unknown): void {
    // 占位空实现——bundle 管线验证面（scripts/bundle-client.mjs 产物自注册形态）。
  },
};

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 项本身为
 * cordis 插件面——function 或含 apply 方法的对象（expert-squad 同型判例）。
 * default 导出经 unwrapExports（__esModule → default）还原插件对象本体。
 */
export default projectClient;
export const apply = projectClient.apply.bind(projectClient);
