// host/dirs · self-derive——deriveTaskStoreDir 单装态自 derivation 兜底缝（plugin-task-loop/1.32②）：
// core forgeProjects face 缺席的宿主（dsh desktop 单装态）添加项目向导派生行恒 typed unavailable
// ——本缝在插件内承接同语义动词：tasksHome 三级解析（config.tasksHome > env DSH_FORGE_TASKS_HOME
// > 宿主 home 约定 {home}/forge-workspaces——self-anchors 同径）+ lib-path 单源算法
//（deriveTaskStoreDir/classifyRegistrationCollision——core 同链同语义，零复制）+ 碰撞三态
// 同收口（suspected-move → ERR_SUSPECTED_MOVE typed 拒绝；在册项目任务库消歧——core verb
// registeredStoreDirs 同语义，行源 = 插件 project.db）。
// 优先级纪律（bug 8de6b903 教训——不遮蔽真失败）：core face 在场恒委托 core，本缝只在
// face 缺席（单装态）被装配侧消费——集成态派生根与注册闭包永不分叉。
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { errMessage } from "@dsh-forge/lib-util";
import { classifyRegistrationCollision, deriveTaskStoreDir as deriveStoreDir } from "@dsh-forge/lib-path";
import type { DeriveTaskStoreDirResult, SuspectedMoveData } from "@dsh-forge/contracts";

/**
 * ERR_SUSPECTED_MOVE typed 拒绝（形状 = projects/errors SuspectedMoveError 同构——
 * boundaries 机检 ① 四域互禁横向 import，本域内形状复制零语义：code 字面量锚
 * lib-api ERROR_CODES 单源，data 载荷 = classifier guidance 三元原样透传）。
 */
class SelfSuspectedMoveError extends Error {
  readonly code = "ERR_SUSPECTED_MOVE" as const;
  readonly data: SuspectedMoveData;
  constructor(data: SuspectedMoveData) {
    super(data.guidance);
    this.name = this.code;
    this.data = data;
  }
}

/** 自 derivation 依赖缝（全部可选——缺席面按解析链降级，三级双缺 = fail-loud 普通错误） */
export interface SelfDeriveDeps {
  /** tasksHome（config.tasksHome——注册闭包碰撞分类器同源，首优先） */
  readonly tasksHome?: string;
  /** 宿主 home（末级派生根 {home}/forge-workspaces——self-anchors 同径） */
  readonly home?: string;
  /** env 注入缝（缺省 process.env——单测注入收敛） */
  readonly env?: { readonly DSH_FORGE_TASKS_HOME?: string };
  /** 中央在册 ws_path 清单（疑似移动消歧——core registeredStoreDirs 同语义；缺席 = 空集） */
  readonly registeredWsPaths?: () => readonly string[] | Promise<readonly string[]>;
  /** 诊断缝（realpath fail-soft 回退留痕——缺席零发射） */
  readonly onDiag?: (payload: { readonly level: "info"; readonly event: string; readonly message: string }) => void;
}

/** 自 derivation 动词（ForgeProjectsRemote 兜底消费面——core verb DeriveTaskStoreDirRequest 同形） */
export type SelfDeriveVerb = (workspaceDir: string) => Promise<DeriveTaskStoreDirResult>;

/**
 * 入口归一（core canonicalizeDir 同口径——fix-30）：可达则 realpath（磁盘真值拼写），失败
 * 回退原拼写（fail-soft：网络盘等不可达场景零变化）。归一只统一 hash8 输入基准。
 */
async function canonicalizeDir(p: string, onDiag: SelfDeriveDeps["onDiag"]): Promise<string> {
  try {
    return await realpath(p);
  } catch (cause) {
    onDiag?.({ level: "info", event: "project-derive", message: `self-derive 目录 realpath 失败（fail-soft 回退原拼写）：${p}：${errMessage(cause)}` });
    return p;
  }
}

/**
 * 建自 derivation 动词（装配单例——typert-remotes 兜底消费）。tasksHome 三级解析与
 * 碰撞三态收口语义 = core deriveTaskStoreDirVerb 镜像（算法/分类器 lib-path 单源，
 * 本缝零复制零重推）。
 */
export function createSelfDeriveOf(deps: SelfDeriveDeps): SelfDeriveVerb {
  return async (workspaceDir) => {
    const env = deps.env ?? process.env;
    const envRoot = env.DSH_FORGE_TASKS_HOME;
    const tasksHome =
      typeof deps.tasksHome === "string" && deps.tasksHome.trim() !== ""
        ? deps.tasksHome
        : envRoot !== undefined && envRoot.trim() !== ""
          ? envRoot
          : typeof deps.home === "string" && deps.home.trim() !== ""
            ? join(deps.home, "forge-workspaces")
            : undefined;
    if (tasksHome === undefined) {
      throw new Error("deriveTaskStoreDir 不可用：tasksHome 未注入（config.tasksHome / DSH_FORGE_TASKS_HOME / 宿主 home 三级双缺）");
    }
    const canonical = await canonicalizeDir(workspaceDir, deps.onDiag);
    const collision = classifyRegistrationCollision(tasksHome, canonical);
    if (collision.state === "suspected-move") {
      const rows = (await deps.registeredWsPaths?.()) ?? [];
      const registered = new Set(rows.map((ws) => deriveStoreDir(tasksHome, ws)));
      // 在册项目任务库消歧（core verb 同语义）：existingDir 恰为某在册项目任务库 = 另一条
      // 在册工作区非孤儿——放行；孤儿（行源缺席）仍 ERR_SUSPECTED_MOVE typed 拒绝。
      if (!registered.has(collision.data.existingDir)) throw new SelfSuspectedMoveError(collision.data);
    }
    return { dir: deriveStoreDir(tasksHome, canonical) };
  };
}
