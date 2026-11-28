// 产品插件启停配置（定位：基础·契约层；零逻辑纯数据）。
// 配置表只承载**意图开关**，不列举闭包成员：
//   · userLayerRow：该插件是否进打包 profile 模板（apps/host/src/profile/template.ts）
//     cordis.patch.yml 用户层 insert 行（首启落地 → 全局装载）。预设组合携带的插件
//     （plugin-forge/-spec——行在预设底稿内，boot overlay 注行）不进用户层
//     （产品裁决 2026-10-09：标准模式零 forge 面）。markdown-kit 迁居批 1.2 起 in-preset
//     行退役转用户层全局行（knowledge/expert-squad 同构）。
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
//   · apps/host template.ts 经 lib-api/product-plugins import（编译期常量进 host dist）。
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
  /** 包居所显式声明（workspace 子路径，自仓库根起——expert-squad 载 'plugins/expert-squad'
   *  root 级树形态；缺席 = assemble 脚本按既有树探测推导）。批1 包归位表驱动面：
   *  packageDirOf 改读本字段（dir 字段包不再按 packages/plugins/<short> 推导）。 */
  readonly dir?: string
  /** 库形态种子（staged 仅作运行时依赖闭包——宿主 dist 静态 import，无装载行）：
   *  dev 装载行漂移对账豁免（plugin-bundle 守卫）；userLayerRow 恒 false。 */
  readonly librarySeed?: boolean
}

/**
 * 产品插件意图开关表（键序 = insert 行序）。
 * knowledge（knowledge-stage1-foundation 1.9 A5 重开放）：知识库阶段①地基落位
 * （自持存储 + 自有服务 + 技能物化装配）——进用户层（全局装载：tool 双件 +
 * forge:knowledge 段 + knowledge.root 声明全组合继承）并作 staging 种子随包
 * （skills/learn 技能面由 STAGING_EXTRAS 承载）。
 */
export const PRODUCT_PLUGINS: Readonly<Record<string, ProductPluginSwitch>> = {
  core: { userLayerRow: true },
  // expert-squad（2026-10-31 打包 404 fix，bug 3afa0723）：专家管理面板 client 半随 web
  // 壳无条件构建（vite emitPluginBundle），host 半却三条 staging 种子全不可达（无预设
  // 组合专行——hr.patch 钉死「全局单实例注册、各组合统一继承」；无 userLayerRow；零
  // @dsh-forge 依赖无闭包径）→ 安装版 runtime 缺包，/api/expert-squad/* 全 404。
  // userLayerRow: true = 全局装载（管理工具面非 forge 管线面，不违标准模式零 forge 裁决），
  // 同时作为 staging 种子随包（零内置专家——随包 experts/ 档案已删，
  // expert-builtin-redistribution；技能面/装配行由 STAGING_EXTRAS 承担）。
  // dir（批1 包归位）：包自 packages/plugins/ 迁 root 级 plugins/ 树——assemble 侧
  // packageDirOf 改读本字段直取居所（键 = 表值 'plugins/expert-squad'）。
  'expert-squad': { userLayerRow: true, dir: 'plugins/expert-squad' },
  // markdown-kit（md-mermaid 迁居批 1.2 改名 + 装载通道切换，knowledge 同构）：in-preset 双组合行退役——
  // 转挂包内 cordis.patch.yml 全局注册行（dsh.bundle.patch 声明指向，loader 按声明读
  // 包内该文件），validateMermaid 全组合在场（行为语义变化已提案认账）。userLayerRow
  // = 打包模板全局行 + staging 种子随包。ui 半不经 client 束装载（apps 构建期 import
  // './web' 出口），零 client bundle 声明。
  'markdown-kit': { userLayerRow: true, dir: 'plugins/markdown-kit' },
  // 打包形态发货覆写（1.17 批二卸旧装新，自 git-worktree 行接替）：host dist boot 链
  // （child/run/m2-wiring/bindings）静态 import 本包——缺席即安装版主进程
  // ERR_MODULE_NOT_FOUND 启动即崩。行装载不走用户层：boot overlay presence 门注行
  // （dev 同径单源）。旧 @dsh-forge/git-worktree 域已归并本包，staged 种子随迁。
  project: { userLayerRow: false, staged: true },
  // path-key（M1 阶段B 闭包补径，project 同款 staged 覆写）：旧包 plugin-forge[+spec] 是其
  // 唯一 runtime dependencies 声明方（knowledge/project 声明在 devDependencies——不入闭包
  // BFS），旧包退役即出闭包；host dist boot 链（ipc/bindings normalizeFsPath）静态 import
  // 本包——缺席即安装版主进程 ERR_MODULE_NOT_FOUND 启动即崩。纯逻辑库形态（零装载行，
  // librarySeed——dev 装载行漂移对账豁免）。
  'path-key': { userLayerRow: false, staged: true, librarySeed: true },
  // task-loop（plugin-task-loop 1.15 退役批 staging 闭包登记，project 同款）：host dist boot
  // 链（bridge/run/remote-rpc/tasks-rpc/test-bridge）静态 import 本包（1.14 host 改指）——
  // 缺席即安装版主进程 ERR_MODULE_NOT_FOUND 启动即崩。行装载不走用户层（组合装配行 =
  // plugins/task-loop/cordis.patch.yml，dsh.bundle.patch 声明指向）；skills/（to-tasks 拆解
  // 技能 + 1.15 自 plugin-forge 迁入的 submit-task 结算技能）随包由 STAGING_EXTRAS 承载。
  'task-loop': { userLayerRow: false, staged: true, dir: 'plugins/task-loop' },
  // spec（plugin-spec 1.10 docs 域收编，task-loop 同款 staging 闭包登记）：core dist 装配行
  // 静态 import 本包（forgeDocs 读域 factory——收编改指 @dsh-forge/spec 出口）——缺席即安装
  // 版主进程 ERR_MODULE_NOT_FOUND 启动即崩。行装载不走用户层：M5 组合器接线前为库形态种子
  // （librarySeed——零装载行，dev 漂移对账豁免）；组合装配行 cordis.patch.yml 随包由
  // STAGING_EXTRAS 承载（dsh.bundle.patch 声明指向——行接线后 loader 按声明读包内该文件）。
  spec: { userLayerRow: false, staged: true, dir: 'plugins/spec', librarySeed: true },
  knowledge: { userLayerRow: true, dir: 'plugins/knowledge' },
}
