// @dsh-forge/forge —— client 自有视图最小入口（forge-aggregate-bundle 1.6）：
// 五件 client 自注册单元合并退役（bundle 通道下五件插行自带 client 半侧、各自注册，
// id 互异零冲突——零合并、零手工缝）；本入口仅承载 forge 自有视图面。
//
// 阶段一零视图（最小自有入口）：Workbench 三面视图归 forge-workbench 期在此生长
// （视图模块随包构建自动并入 bundle-client 产物，六插行与 file: 依赖零变化）。
// bundle-client 构建面保留：产物经 scripts/bundle-client.mjs 包装为 classic script
// 自注册单注册（id = @dsh-forge/forge——结构 pin：tests/forge/deep-retirement-pin.test.ts）。
export const FORGE_VIEW_ID = "@dsh-forge/forge";
