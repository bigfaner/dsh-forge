// project_key 派生单源（entities.md §3.1：行级归属键 = cwd 纯函数派生，无 default——
// 派生失败拒写由派生面显式拒绝 + 列 NOT NULL 建表级兜底双层保证）。
// f 单源 = lib-path deriveDirName（`{flatten}@{hash8}`——plugin-project projectKeyOf
// 同源函数，拼写敏感设计：canonical path 原样入参，调用方负责 canonicalize）。
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
