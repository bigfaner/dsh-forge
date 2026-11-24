// project_key 派生单源（entities.md §3.1：行级归属键 = cwd 纯函数派生，无 default——
// 派生失败拒写由派生面显式拒绝 + 列 NOT NULL 建表级兜底双层保证）。
// f 单源 = lib-path deriveDirName（`{flatten}@{hash8}`——plugin-project projectKeyOf
// 同源函数）。键拼写语义（key-audit G-F2 改述，实测口径）：输入先经 normalizeDirSpelling
// 归一（`/` → `\` + 去尾分隔符）——分隔符方向/尾分隔符**不敏感**，同物理路径不同正字法
// 派生同键；**大小写不折叠、仍敏感**（`C:\Repo` 与 `C:\repo` 异键）。调用方负责 realpath
// canonicalize（大小写拼写差异由 canonical 化消解，键派生面不兜）。
// G-F1 存量留痕（POSIX 形态键漂移）：归一口径无条件 `/` → `\`，POSIX 起首路径（`/home/…`）
// 派生键随之落 `\` 形态、与 POSIX 原生形态键漂移。适用范围：本产品部署面 = Windows
// Desktop（cwd 恒 `X:\…` 反斜杠形态），该漂移实害为零；迁移条件：未来出现 POSIX 宿主/容器
// 部署时，须先统一键归一口径（normalizeDirPath 的 POSIX 分支——POSIX 保持 `/` 仅去尾）并
// 重派存量行 project_key，不得直接复用本口径。
import { deriveDirName } from "@dsh-forge/lib-path";

/** project_key 派生失败（空 cwd——无归属可派生，拒写不入隔离区形态由调用方分派）。 */
export class ProjectKeyDerivationError extends Error {
  constructor() {
    super("project_key derivation failed: empty cwd (ERR_PROJECT_KEY_DERIVATION)");
    this.name = "ProjectKeyDerivationError";
  }
}

/**
 * cwd → project_key 纯函数派生（全部容器写点唯一取径——零内联重写）。
 * 空/空白 cwd 显式拒绝（返回值恒非空字符串，NOT NULL 拒写路径由此上移为派生面 fail-loud）。
 */
export function deriveProjectKey(cwd: string): string {
  if (cwd.trim() === "") throw new ProjectKeyDerivationError();
  return deriveDirName(cwd);
}
