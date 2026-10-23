// @dsh-forge/expert-squad —— client face（浏览器半；scripts/bundle-client.mjs 按官方
// clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic <script>
// 装载）。1.1 骨架：半完整 cordis 插件形态（组合 apply 对象，对策 annotator
// gotcha-web-boot 判例——无 apply → 真机 `invalid plugin`）；slots.inject(main) +
// 管理面板挂载由后续任务按 tech-design §5 填充。返回值铁律：apply 必须返回
// undefined（cordis 组合把返回值当 effect 消费，非空对象 = Invalid effect）。

/** client face 组合 apply 插件对象（骨架空载，面板挂载由后续任务填充）。 */
export const expertSquadClient = {
  apply(): void {
    // 骨架期零接线——留痕供真机判读装载链路。
    console.debug('[dsh-forge/expert-squad] client apply (skeleton)')
  },
}

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 须本身为
 * cordis 插件面——function 或含 apply 方法的对象（input-history 同型判例）。
 */
export const apply = expertSquadClient.apply.bind(expertSquadClient)
