// 1.4 双形态解析 pin（dev / packaged；Implementation Notes：自本任务区分，供 4.1 消费）。
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hostRoot, isDevProfile, isPackagedForm, productPackagePresent, resolveHostPaths } from './paths.js'

describe('isDevProfile（fix-1 causeStack 生境门同源判据）', () => {
  it("真值/'0' 语义与 resolveHostPaths form 判定同式", () => {
    expect(isDevProfile({ DSH_FORGE_DEV_PROFILE: 'dev' })).toBe(true)
    expect(isDevProfile({ DSH_FORGE_DEV_PROFILE: '1' })).toBe(true)
    expect(isDevProfile({ DSH_FORGE_DEV_PROFILE: undefined })).toBe(false)
    expect(isDevProfile({ DSH_FORGE_DEV_PROFILE: '' })).toBe(false)
    expect(isDevProfile({ DSH_FORGE_DEV_PROFILE: '0' })).toBe(false)
  })
})

describe('resolveHostPaths 双形态', () => {
  it('packaged 默认：profile = {userData}/profile，dshHome 缺省隔离 {userData}/dsh-home（fix-26）', () => {
    const paths = resolveHostPaths({}, 'C:/app-data/dsh-forge')
    expect(paths.form).toBe('packaged')
    expect(paths.profileDir.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/profile')
    expect(paths.dshHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/dsh-home')
    // 4.2 装配期路径：状态库 + knowledge 绑定表（boot overlay 注入 / host 维护）——应用私有面不随 fix-26 变
    expect(paths.stateDb.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/state.db')
    expect(paths.bindingsFile.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/knowledge-bindings.json')
    // 3.4 M2 派生根缺省：{userData}/forge-workspaces（tech-design Layer Placement host 行）
    expect(paths.tasksHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/forge-workspaces')
    // M3 3.8 设置域存储：{userData}/forge-settings.json——恒与 state.db 同目录
    //（core 路径守卫基准 = dirname(dbFile)，异目录即插件构造 fail-loud 拒启）
    expect(paths.settingsFile.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/forge-settings.json')
    expect(paths.settingsFile.replaceAll('\\', '/')).toBe(paths.stateDb.replaceAll('\\', '/').replace(/state\.db$/, 'forge-settings.json'))
  })

  it('dev 形态：DSH_FORGE_DEV_PROFILE 真值 → workspace 预组装 profile.dev 目录', () => {
    const paths = resolveHostPaths({ DSH_FORGE_DEV_PROFILE: 'dev' }, 'C:/irrelevant')
    expect(paths.form).toBe('dev')
    expect(paths.profileDir).toBe(join(hostRoot(), 'profile.dev'))
    expect(existsSync(join(paths.profileDir, 'package.json'))).toBe(true)
  })

  it('DSH_FORGE_PROFILE_DIR 显式覆盖（绝对路径直取；相对路径锚 host 根）', () => {
    const abs = resolveHostPaths({ DSH_FORGE_PROFILE_DIR: 'X:/tmp/prof' }, 'C:/ud')
    expect(abs.profileDir).toBe('X:/tmp/prof')
    const rel = resolveHostPaths({ DSH_FORGE_PROFILE_DIR: 'profile.dev' }, 'C:/ud')
    expect(rel.profileDir).toBe(join(hostRoot(), 'profile.dev'))
  })

  it('installAnchor：默认解析 @deepseek-ai/dsh/package.json（installAnchor 树在场），env 可覆盖', () => {
    const paths = resolveHostPaths({}, 'C:/ud')
    expect(paths.installAnchor.replaceAll('\\', '/')).toMatch(/@deepseek-ai[/\\]dsh[/\\]package\.json$/)
    expect(existsSync(paths.installAnchor)).toBe(true)
    const over = resolveHostPaths({ DSH_FORGE_INSTALL_ANCHOR: 'X:/anchor/pkg.json' }, 'C:/ud')
    expect(over.installAnchor).toBe('X:/anchor/pkg.json')
  })

  it('hostRoot 指向 apps/host 包根（src 与 dist 同深度锚定）', () => {
    expect(existsSync(join(hostRoot(), 'package.json'))).toBe(true)
    expect(hostRoot().replaceAll('\\', '/')).toMatch(/apps\/host$/)
  })
})

// 3.4 M2 派生根（resolveTasksHome）：env DSH_FORGE_TASKS_HOME > {userData}/forge-workspaces
//（tech-design Layer Placement host 行——注入 core 行 config.tasksHome，缺席 env 走缺省）
describe('resolveHostPaths M2 派生根（DSH_FORGE_TASKS_HOME）', () => {
  it('env 显式覆盖（绝对路径直取；相对路径锚 host 根；空串 = 缺省）', () => {
    const abs = resolveHostPaths({ DSH_FORGE_TASKS_HOME: 'X:/ws/tasks-home' }, 'C:/ud')
    expect(abs.tasksHome).toBe('X:/ws/tasks-home')
    const rel = resolveHostPaths({ DSH_FORGE_TASKS_HOME: 'tmp/tasks' }, 'C:/ud')
    expect(rel.tasksHome).toBe(join(hostRoot(), 'tmp/tasks'))
    const empty = resolveHostPaths({ DSH_FORGE_TASKS_HOME: '' }, 'C:/ud')
    expect(empty.tasksHome.replaceAll('\\', '/')).toBe('C:/ud/forge-workspaces')
  })

  it('plugin-forge skills 挂载目录：installAnchor 树上溯解析（node_modules/@dsh-forge/plugin-forge/skills——customSkillDirs 源）', () => {
    const paths = resolveHostPaths({ DSH_FORGE_DEV_PROFILE: 'dev' }, 'C:/ud')
    expect(paths.skillsDir).toBeDefined()
    expect(paths.skillsDir!.replaceAll('\\', '/')).toMatch(/@dsh-forge[/\\]plugin-forge[/\\]skills$/)
    expect(existsSync(paths.skillsDir!)).toBe(true) // junction 透传（workspace 链接树）
    expect(existsSync(join(paths.skillsDir!, 'submit-task', 'SKILL.md'))).toBe(true)
  })

  it('plugin-forge skills 挂载目录：树内缺席 → undefined（fail-soft 技能面降级，不抛）', () => {
    // 独立根（无 node_modules 树）显式 anchor → 上溯至文件系统根不中
    const isolated = resolveHostPaths({ DSH_FORGE_INSTALL_ANCHOR: 'X:\\nowhere\\anchor\\package.json' }, 'C:/ud')
    expect(isolated.skillsDir).toBeUndefined()
  })

  it('plugin-forge-spec skills 挂载目录（M3 3.7 预设装配 customSkillDirs[spec]）：锚树在场 → 解析；缺席 → undefined fail-soft（同法 fixture 驱动——不依赖当期包内容）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-paths-spec-'))
    try {
      const anchor = join(root, 'anchor', 'package.json')
      const specSkills = join(root, 'node_modules', '@dsh-forge', 'plugin-forge-spec', 'skills')
      const coreSkills = join(root, 'node_modules', '@dsh-forge', 'plugin-forge', 'skills')
      mkdirSync(coreSkills, { recursive: true }) // core 树在场；spec 树缺席
      const absent = resolveHostPaths({ DSH_FORGE_INSTALL_ANCHOR: anchor }, 'C:/ud')
      expect(absent.skillsDir).toBe(coreSkills)
      expect(absent.specSkillsDir).toBeUndefined() // spec 技能面降级（fail-soft 不抛断启动）
      mkdirSync(specSkills, { recursive: true }) // spec 树落地（3.2 后形态）→ 解析同法
      const present = resolveHostPaths({ DSH_FORGE_INSTALL_ANCHOR: anchor }, 'C:/ud')
      expect(present.specSkillsDir).toBe(specSkills)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// 4.1 打包形态资源根：DSH_FORGE_RESOURCES_DIR 置位 → installAnchor = {resources}/runtime/package.json
// （合成 anchor 清单，assemble-installer-resources.mjs 物化；main 侧 app.isPackaged 注入）
describe('resolveHostPaths 打包资源根（DSH_FORGE_RESOURCES_DIR）', () => {
  it('置位 → anchor = {resources}/runtime/package.json + resourcesDir 透出', () => {
    const paths = resolveHostPaths({ DSH_FORGE_RESOURCES_DIR: 'X:/install/resources' }, 'C:/ud')
    expect(paths.resourcesDir).toBe('X:/install/resources')
    expect(paths.installAnchor.replaceAll('\\', '/')).toBe('X:/install/resources/runtime/package.json')
  })

  it('相对 resources 根锚 host 根（与 DSH_FORGE_PROFILE_DIR 同语义）', () => {
    const rel = resolveHostPaths({ DSH_FORGE_RESOURCES_DIR: 'rel/res' }, 'C:/ud')
    expect(rel.resourcesDir).toBe(join(hostRoot(), 'rel/res'))
    expect(rel.installAnchor).toBe(join(hostRoot(), 'rel/res', 'runtime', 'package.json'))
  })

  it('DSH_FORGE_INSTALL_ANCHOR 显式覆盖优先于 resources 推导（调试口径）', () => {
    const over = resolveHostPaths(
      { DSH_FORGE_RESOURCES_DIR: 'X:/install/resources', DSH_FORGE_INSTALL_ANCHOR: 'X:/other/pkg.json' },
      'C:/ud',
    )
    expect(over.installAnchor).toBe('X:/other/pkg.json')
    expect(over.resourcesDir).toBe('X:/install/resources')
  })

  it('未置位 → 无 resourcesDir，anchor 回退 workspace 解析（dev/调试形态）', () => {
    const paths = resolveHostPaths({}, 'C:/ud')
    expect(paths.resourcesDir).toBeUndefined()
    expect(existsSync(paths.installAnchor)).toBe(true)
  })
})

// fix-26：DSH_HOME 两层解析（数据隔离缺省——收口 fix-18 全共享副作用：原生 dsh 工作区/会话
// 混入产品账本即 fix-24 选择器污染根源；fix-18 USER_DATA 分支值升为缺省，e2e 形态值不变零改动）
describe('resolveHostPaths DSH_HOME 两层解析（fix-26）', () => {
  it('缺省（人用 dev/打包形态）→ 隔离 {userData}/dsh-home（dev/打包同口径）', () => {
    const dev = resolveHostPaths({ DSH_FORGE_DEV_PROFILE: 'dev' }, 'C:/app-data/dsh-forge')
    expect(dev.dshHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/dsh-home')
    // 打包形态同口径：resources 根在场（app.isPackaged 注入）不改变隔离缺省
    const packaged = resolveHostPaths({ DSH_FORGE_RESOURCES_DIR: 'X:/install/resources' }, 'C:/app-data/dsh-forge')
    expect(packaged.form).toBe('packaged')
    expect(packaged.dshHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/dsh-home')
  })

  it('DSH_FORGE_USER_DATA 在场（e2e）→ {userData}/dsh-home 同值（e2e 全套零改动）+ 私有面不动', () => {
    const paths = resolveHostPaths({ DSH_FORGE_USER_DATA: 'C:/e2e-ud' }, 'C:/e2e-ud')
    expect(paths.dshHome.replaceAll('\\', '/')).toBe('C:/e2e-ud/dsh-home')
    expect(paths.stateDb.replaceAll('\\', '/')).toBe('C:/e2e-ud/state.db')
    expect(paths.bindingsFile.replaceAll('\\', '/')).toBe('C:/e2e-ud/knowledge-bindings.json')
  })

  it('DSH_FORGE_DSH_HOME 显式 > 缺省（绝对路径直取；空串视为缺省）', () => {
    const abs = resolveHostPaths(
      { DSH_FORGE_DSH_HOME: 'X:/tmp/dsh-home', DSH_FORGE_USER_DATA: 'C:/e2e-ud' },
      'C:/e2e-ud',
    )
    expect(abs.dshHome).toBe('X:/tmp/dsh-home')
    const empty = resolveHostPaths({ DSH_FORGE_DSH_HOME: '', DSH_FORGE_USER_DATA: 'C:/e2e-ud' }, 'C:/e2e-ud')
    expect(empty.dshHome.replaceAll('\\', '/')).toBe('C:/e2e-ud/dsh-home')
  })

  it('DSH_FORGE_DSH_HOME 相对路径锚 host 根（与 PROFILE_DIR/RESOURCES_DIR 同语义）', () => {
    const rel = resolveHostPaths({ DSH_FORGE_DSH_HOME: 'tmp/dsh-home' }, 'C:/ud')
    expect(rel.dshHome).toBe(join(hostRoot(), 'tmp/dsh-home'))
  })
})

// fix-26 凭据桥生效门（与 fix-18 USER_DATA 隐式隔离门同构）：非 USER_DATA 隔离态 → 真 home
// 凭据文档路径（数据隔离而凭据共享不重配）；USER_DATA 在场（e2e/测试）→ undefined 不读真凭据
describe('resolveHostPaths 凭据桥生效门（fix-26）', () => {
  it('缺省（人用 dev/打包形态）→ {homedir}/.dsh/.credentials.yaml（真 home 凭据文档）', () => {
    const paths = resolveHostPaths({}, 'C:/app-data/dsh-forge')
    expect(paths.credentialsPath).toBe(join(homedir(), '.dsh', '.credentials.yaml'))
  })

  it('DSH_FORGE_USER_DATA 在场（e2e/测试）→ undefined 不桥（不读真凭据）', () => {
    const paths = resolveHostPaths({ DSH_FORGE_USER_DATA: 'C:/e2e-ud' }, 'C:/e2e-ud')
    expect(paths.credentialsPath).toBeUndefined()
    const emptyString = resolveHostPaths({ DSH_FORGE_USER_DATA: '' }, 'C:/ud') // 空串 = 未置位
    expect(emptyString.credentialsPath).toBe(join(homedir(), '.dsh', '.credentials.yaml'))
  })

  it('DSH_FORGE_DSH_HOME 调试口不关桥（门只认 USER_DATA——人用调试语义同缺省）', () => {
    const paths = resolveHostPaths({ DSH_FORGE_DSH_HOME: 'X:/tmp/dsh-home' }, 'C:/ud')
    expect(paths.credentialsPath).toBe(join(homedir(), '.dsh', '.credentials.yaml'))
  })
})

// 产品包在场探测（打包形态启动崩 fix——git-worktree 行注行门消费）：在场 = dev profile 树
// ∪ installAnchor 邻接树两探针。打包形态 profile 目录无 node_modules（boot-chain adjacent
// 拓扑），旧口径单探 profileDir 恒缺席 → 包已 staging 也不注行/不装配（能力恒 absent，
// git 项目 sessionCreate/prompt 双入口 W2 fail-closed 拒绝）。
describe('productPackagePresent 产品包在场探测（dev profile 树 ∪ anchor 邻接树）', () => {
  it('bug: 打包形态 anchor 邻接树在场可判（profileDir 无 node_modules 亦真）——旧口径单探 profileDir 恒 false', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pkg-present-'))
    try {
      // 安装后布局镜像：{resources}/runtime/package.json + runtime/node_modules/@dsh-forge/*
      const runtime = join(root, 'resources', 'runtime')
      const pkgManifest = join(runtime, 'node_modules', '@dsh-forge', 'git-worktree', 'package.json')
      mkdirSync(dirname(pkgManifest), { recursive: true })
      writeFileSync(pkgManifest, '{"name":"@dsh-forge/git-worktree"}', 'utf8')
      const profileDir = join(root, 'profile') // 打包形态首启落地目录——无 node_modules
      expect(productPackagePresent(profileDir, join(runtime, 'package.json'), '@dsh-forge/git-worktree')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('dev 形态 profile 树 link 在场 → 真（现行为保持——junction 透传 workspace 链接树）', () => {
    const dev = resolveHostPaths({ DSH_FORGE_DEV_PROFILE: 'dev' }, 'C:/ud')
    expect(productPackagePresent(dev.profileDir, dev.installAnchor, '@dsh-forge/git-worktree')).toBe(true)
  })

  it('两探针树均缺席 → false（kill-switch/未安装形态——fail-soft 不注行）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-pkg-absent-'))
    try {
      const anchor = join(root, 'runtime', 'package.json') // 树空（包未物化）
      expect(productPackagePresent(join(root, 'profile'), anchor, '@dsh-forge/git-worktree')).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// 形态判定门（2026-10-19 dev:debug 启动崩 fix）：dev.mjs 复制 electron.exe → dsh-forge-dev.exe
// 启动（进程名区分用户裁决）后，Electron 的 app.isPackaged 按 exe 名判定（非 electron* 即
// true）→ dev 下恒 true（dsh-forge-dev.exe 实测 isPackaged=true，electron.exe 同 app=false）。
// main 侧打包分支（便携数据目录 + DSH_FORGE_RESOURCES_DIR 注入）单看 isPackaged 即误入：
// resources 根指进 electron dist → resolveChildEntry 探 runtime/host-dist 缺席 throw（半成型
// 资源）。isPackagedForm = isPackaged ∧ 非 dev 形态——与 resolveHostPaths form 同源
// （DSH_FORGE_DEV_PROFILE 真值）。
describe('isPackagedForm 形态判定门（app.isPackaged 不可单腿）', () => {
  it('bug: dev 改名副本 exe（isPackaged=true ∧ DEV_PROFILE 真值）误判打包形态——dev:debug 启动崩根因', () => {
    expect(isPackagedForm({ DSH_FORGE_DEV_PROFILE: 'dev' }, true)).toBe(false)
  })

  it('真打包形态：isPackaged=true ∧ DEV_PROFILE 缺席/空串/0（安装版/安装形态 e2e）', () => {
    expect(isPackagedForm({}, true)).toBe(true)
    expect(isPackagedForm({ DSH_FORGE_DEV_PROFILE: '' }, true)).toBe(true)
    expect(isPackagedForm({ DSH_FORGE_DEV_PROFILE: '0' }, true)).toBe(true)
  })

  it('非打包：isPackaged=false（形态无关——dev 直跑 electron.exe / e2e dev 走查）', () => {
    expect(isPackagedForm({}, false)).toBe(false)
    expect(isPackagedForm({ DSH_FORGE_DEV_PROFILE: 'dev' }, false)).toBe(false)
  })
})
