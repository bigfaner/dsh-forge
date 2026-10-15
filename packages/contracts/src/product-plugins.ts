// 产品插件启停配置（定位：基础·契约层；零逻辑纯数据）。
// 配置表只承载**意图开关**，不列举闭包成员：
//   · userLayerRow：该插件是否进打包 profile 模板（apps/host/src/profile/template.ts）
//     cordis.patch.yml 用户层 insert 行（首启落地 → 全局装载）。预设组合携带的插件
//     （plugin-forge/-spec/md-mermaid——行在预设底稿内，boot overlay 注行）不进
//     用户层（产品裁决 2026-10-09：标准模式零 forge 面），故不在本表。
//   · staged（可选覆写）：false = 强制不随安装包发货（kill-switch——即使被引用/
//     被依赖也不物化）；true = 强制发货；缺席 = 自动推导。
// staging 集合自动推导（scripts/assemble-installer-resources.mjs
// stagedProductPackages——单一机制，新增产品包零配置）：
//   种子 = userLayerRow 插件 ∪ 预设底稿携带插件（presets/*.patch.yml `name:
//   '@dsh-forge/<短名>'` 行扫描）∪ staged:true 覆写，闭包 = 种子的
//   @dsh-forge/* 运行时依赖（packages/<dir>/package.json dependencies BFS），
//   再剔除 staged:false——contracts/path-key 等依赖闭包成员由此自动随包，
//   「忘列闭包成员」类缺陷（e791a46 path-key 漏列）结构性消除。
// 键 = 包短名（packages/<短名> 平铺；packages/plugins/<短名> 子居所由脚本探测）。
// 消费面：
//   · apps/host template.ts 经 @dsh-forge/contracts import（编译期常量进 host dist）。
//   · scripts/assemble-installer-resources.mjs 经 packages/contracts/dist 动态 import
//     （前置 = pnpm build——物化脚本本就 fail-loud 前置构建产物）。
// 不受本表约束的面：
//   · dev 形态（apps/host/profile.dev/cordis.patch.yml 手维文件——dev 直链
//     workspace 构建产物，插件行始终在场，开发时全量可用）。
//   · boot overlay 的插件行 config 注入（apps/host/src/boot/overlay.ts knowledgeRow
//     门 = 运行期按 profile 树在场探测——配置翻转后 dev/打包形态各自自洽）。
export interface ProductPluginSwitch {
  /** 打包 profile 模板用户层 insert 行（全局装载） */
  readonly userLayerRow: boolean
  /** staging 覆写（缺席 = 自动推导：被行/预设/闭包引用即发货） */
  readonly staged?: boolean
}

/**
 * 产品插件意图开关表（键序 = insert 行序）。
 * 现值裁决：knowledge——知识库功能不完整，暂不开放：不进用户层（userLayerRow:
 * false）也不随包（staged: false kill-switch——当前无预设引用、无包依赖它，本就
 * 不入闭包，显式声明是防将来有人加引用时静默带出）；dev 形态仍含。
 * 重开放 = 删本行（或改 userLayerRow: true）——模板行/staging/关键文件/前置
 * 全随之派生，仅需同步两处现值 pin（materialize.test.ts / installer-pipeline.test.ts）。
 */
export const PRODUCT_PLUGINS: Readonly<Record<string, ProductPluginSwitch>> = {
  core: { userLayerRow: true },
  knowledge: { userLayerRow: false, staged: false },
}
