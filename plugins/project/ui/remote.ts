// ui/remote.ts —— forge:* client 贡献消费缝（typert strict 迁移 1.5——D3 client 半生成化）：
// 手写 descriptor 表退役。$mount 贡献 = 官方 generator 产出的 Host-for-Client Remote 投影
// （官方三件套的 client 消费件：package.json exports["./remote"] → dist/typert.remote-client.js
// 的 TYPERT_REMOTE——TypertRemoteInfo = { package, descriptors } 结构同型 TypertRemoteContribution）。
// descriptor/codec（zod schema 工厂）全部由构建期生成物锁定，与 host 半 @Remote 装饰器源
// （host/assembly/typert-remotes.ts 单一事实源）同源生成——双表漂移缺陷族结构性消灭。
// 官方契约对账（2026-11-15 用户供文档）：./client/typert（lib/typert.client.*）属「同时贡献
// 两侧 face」的包；rc.2 analyzer 的 client face invocations 恒 host-only（analyzer.ts:800），
// 本包 ui 半为零 @typert surface 的纯消费半 → generator 不产 typert.client.* 工件（官方
// 生态实证：全部在装官方包均无 typert.client.js），照官方先例不挂悬空导出——client 消费件
// = ./remote 投影，与官方三件套命名一致（勿自造）。
export { TYPERT_REMOTE as FORGE_REMOTE_CONTRIBUTION } from "../dist/typert.remote-client.js";
