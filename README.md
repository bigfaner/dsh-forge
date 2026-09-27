# dsh-forge

以项目为中心的 SDD 工作台 —— dsh 引擎 × forge 方法论的 Electron 桌面应用。

## 开发者指南

### 插件改动后必须重打 tarball(技能面静默缺席坑)

**症状**:合并了含插件改动的分支(或改了插件源码/资源)后直接 `pnpm run dev:desktop`,会话里 15 项 forge 技能全部缺席,且 UI 无任何报错。

**链路背景**:

- `apps/desktop/resources/plugin-bundles.json` 将 `@dsh-forge/plugin-forge-workbench` 声明为 `tarball:` 源;dev 模式 boot 时从 `apps/desktop/resources/plugin-tarballs/*.tgz` 将插件物化到 userData host-profile(`%APPDATA%/@dsh-forge/desktop/host-profile/node_modules/...`)。
- 物化是 write-once:物化目录内 seed marker(`.dsh-forge-seed.json`)记录的 sha256 与 staged tarball 一致即稳态跳过;tarball 内容变化(sha 漂移)才会重新物化。
- **staged tarball 是 gitignore 的本地产物**——合并分支、拉取代码都不会刷新它。
- 若物化出的插件缺 `lib/skill-dirs.js`(customSkillDirs boot 同步机制产物),壳侧 `syncProfileSkillDirs` 会按设计静默跳过("不携带技能同步面的 bundle")→ 用户层 `cordis.patch.yml` 从未写入 `customSkillDirs` → 技能面整体静默降级。

**操作**:凡改插件源码/资源,或合并了含插件改动的分支后:

```bash
pnpm build:plugins && pnpm stage:plugin-tarballs
```

然后**重启应用**——物化与技能同步都只发生在 boot 时。重启前确认旧实例已真正退出(任务管理器查 `electron.exe`;关窗 ≠ 退进程):单实例锁会把新实例**静默弹掉**,你面对的仍是旧实例,症状表现为"重启了也没变化"。

**验证**:

```bash
# 新 tarball 应含技能文件(128 个)与同步产物
tar -tzf apps/desktop/resources/plugin-tarballs/dsh-forge-plugin-forge-workbench-0.1.0.tgz | grep -c resources/skills
tar -tzf apps/desktop/resources/plugin-tarballs/dsh-forge-plugin-forge-workbench-0.1.0.tgz | grep skill-dirs
```

- 重启后 `%APPDATA%/@dsh-forge/desktop/host-profile/` 出现 `cordis.patch.yml`(受管行含 `disabled: false` 与 `customSkillDirs` 条目)与 `.dsh-forge-skill-dirs.json` marker。
- 最终验证(用户可见面):会话输入框输入 `/`,技能列表应出现 15 项**扁平名**技能(如 `brainstorm`、`write-prd`);不存在 `/forge:` 前缀,搜 `/forge` 找不到是预期行为。
- 诊断入口:壳日志 `SKILL_DIRS_SYNCED` / `ERR_SKILL_DIR_SYNC`;概览页置顶告警卡(`skillDirSyncAlerts`)。注意:组合层把 provider 禁用属静默类故障,不产生 `ERR_SKILL_DIR_SYNC`——排查组合问题见 `docs/lessons/gotcha-user-layer-patch-field-override.md`。
