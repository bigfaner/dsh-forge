// ui/remote.ts —— forgeTasks client 贡献消费缝（typert strict 迁移 client 半生成化）：
// $mount 贡献 = 官方 generator 产出的 Host-for-Client Remote 投影（package.json
// exports["./remote"] → dist/typert.remote-client.js 的 TYPERT_REMOTE——TypertRemoteInfo
// = { package, descriptors } 结构同型 TypertRemoteContribution）。
// descriptor/codec（zod schema 工厂）全部由构建期生成物锁定，与 host 半 @Remote 装饰器源
// （host/assembly/typert-remotes.ts 单一事实源）同源生成——双表漂移缺陷族结构性消灭。
// 本包 ui 半为零 @typert surface 的纯消费半 → generator 不产 typert.client.* 工件，
// 照官方先例不挂悬空导出——client 消费件 = ./remote 投影（project/ui/remote.ts 正典
// 配方承袭，勿自造）。
export { TYPERT_REMOTE as FORGE_TASKS_REMOTE_CONTRIBUTION } from "../dist/typert.remote-client.js";
