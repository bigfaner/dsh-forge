// forgeSpecs 服务域（plugin-spec 1.3，code-design §1/§2）——域逻辑唯一事实源：
// createSpec 单事务原子落库（校验门 → withTransaction 四表 INSERT + 文档写缝）、
// updateSpec 守卫族（必含 Goal / 归档冻结 / rel_path 跨 spec 重复）、transitionSpec
// 状态机两写（现值 UPDATE + 台账 append 同事务）。
// 依赖注入形态：SpecVerbDeps（db 动词零裸开；writeSpecDoc 文件写缝——装配面注真实现、
// 测试注桩）；归属键 = cwd 纯函数派生（lib/path deriveDirName 单源，派生失败拒写）。
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { deriveDirName } from "@dsh-forge/lib-path";
import { withTransaction } from "@dsh-forge/lib-db";
import type { DocsRepo } from "../../db/repositories/docs-repo.js";
import type { SpecRepo } from "../../db/repositories/spec-repo.js";
import type { TransitionsRepo } from "../../db/repositories/transitions-repo.js";
import type {
  GoalRow,
  SpecRow,
  SpecStatus,
  TransitionActor,
} from "../../db/row-types.js";
import { isSpecError, SpecError } from "./errors.js";
import {
  assertSpecTransitionAllowed,
  type SpecTransitionGuard,
} from "./guards.js";

export { isSpecError, SpecError };
export type { SpecErrorCode, SpecErrorData } from "./errors.js";
export { assertSpecTransitionAllowed, SPEC_TRANSITION_EDGES, HUMAN_ONLY_STATUSES } from "./guards.js";

/** tiers 交付档位封闭四值（提案 §二 裁决；应用层校验——DDL 只保 JSON 良构）。 */
export const SPEC_TIERS = ["ui", "api", "pure-logic", "docs"] as const;
export type SpecTier = (typeof SPEC_TIERS)[number];

export interface GoalInput {
  title: string;
  brief?: string;
  /** AC 判据文本清单（逐字精确存储，归一化仅匹配层） */
  acs: string[];
}

export interface CreateSpecInput {
  cwd: string;
  slug: string;
  title: string;
  tiers?: string[];
  goals: GoalInput[];
  /** Spec 文档登记路径（相对项目根，随参显式——.forge/specs/{slug}/spec.md 惯例） */
  docRelPath: string;
  docContent?: string;
}

export interface UpdateSpecInput {
  cwd: string;
  slug: string;
  title?: string;
  tiers?: string[];
  docRelPath?: string;
}

export interface TransitionSpecInput {
  cwd: string;
  slug: string;
  to: SpecStatus;
  /** 驳回（→draft）必填理由；其余流转可空 */
  note?: string;
  actor: TransitionActor;
}

export interface SpecVerbDeps {
  db: Database.Database;
  repos: {
    specs: SpecRepo;
    transitions: TransitionsRepo;
    docs: DocsRepo;
  };
  /** 文件写缝（code-design 替身位置①）：装配面注入真实现（tmp+rename），测试注入桩。
   *  第三参 projectKey = 归属键（plugin-spec 1.4：装配面真实现按键解析项目检出根落盘）；
   *  第四参 cwd = 本次调用会话检出根（缺省装配缝的键守卫回退锚——bug fefd5149 缝②）。 */
  writeSpecDoc: (relPath: string, content: string, projectKey: string, cwd: string) => void;
  generateId?: () => string;
  now?: () => string;
  /** M4 专家门挂缝（guards.ts seam 单源） */
  transitionGuards?: SpecTransitionGuard[];
}

export interface ForgeSpecsService {
  createSpec(input: CreateSpecInput): SpecRow;
  updateSpec(input: UpdateSpecInput): SpecRow;
  /** Goal/AC 全集批量增改（删插同事务；必含 Goal 不变式服务层单点守卫） */
  replaceGoals(input: { cwd: string; slug: string; goals: GoalInput[] }): SpecRow;
  transitionSpec(input: TransitionSpecInput): SpecRow;
  listSpecs(input: { cwd: string; statusFilter?: SpecStatus }): SpecRow[];
  /** 父链追溯（spec→goals→acs 三跳）+ 文档登记 + 流转台账 */
  getSpec(input: { cwd: string; slug: string }):
    | {
        spec: SpecRow;
        goals: Array<{ goal: GoalRow; acs: Array<{ id: string; criterion: string; sortKey: number }> }>;
        doc: { relPath: string } | undefined;
        transitions: ReturnType<TransitionsRepo["listBySpec"]>;
      }
    | undefined;
}

/** tiers 封闭四值校验（应用层单点——DDL CHECK 无法对 JSON 数组成员做封闭集判定）。 */
export function assertTiersValid(tiers: string[] | undefined): string[] {
  const value = tiers ?? [];
  if (!Array.isArray(value)) {
    throw new SpecError("ERR_SPEC_TIERS_INVALID", "tiers 必须为数组", { tiers: value });
  }
  for (const tier of value) {
    if (!(SPEC_TIERS as readonly string[]).includes(tier)) {
      throw new SpecError("ERR_SPEC_TIERS_INVALID", `tiers 越界值：${tier}`, { tiers: value });
    }
  }
  return value;
}

/** 归属键派生单源（lib/path）——cwd 空/空白即派生失败拒写（NOT NULL 无 default 的服务层前置门）。 */
export function deriveProjectKey(cwd: string): string {
  const key = typeof cwd === "string" ? deriveDirName(cwd) : "";
  if (!cwd.trim() || !key.trim()) {
    throw new SpecError("ERR_SPEC_PROJECT_KEY_DERIVATION", "归属键派生失败：cwd 缺失", {
      cwd,
    });
  }
  return key;
}

function assertGoalsValid(goals: GoalInput[]): void {
  if (!Array.isArray(goals) || goals.length < 1) {
    throw new SpecError("ERR_SPEC_GOALS_EMPTY", "Spec 必含至少一个 Goal", { goals });
  }
  for (const goal of goals) {
    if (!goal.title || !goal.title.trim()) {
      throw new SpecError("ERR_SPEC_GOALS_EMPTY", "Goal title 缺失", { goal });
    }
    if (!Array.isArray(goal.acs)) {
      throw new SpecError("ERR_SPEC_CRITERION_EMPTY", "Goal AC 清单缺失", { goal });
    }
    for (const criterion of goal.acs) {
      if (!criterion || !criterion.trim()) {
        throw new SpecError("ERR_SPEC_CRITERION_EMPTY", "AC 判据文本缺失", { goal });
      }
    }
  }
}

function renderDefaultSpecDoc(input: { slug: string; title: string; goals: GoalInput[] }): string {
  const lines = [`# ${input.title}`, "", `## Goals`, ""];
  input.goals.forEach((goal, i) => {
    lines.push(`${i + 1}. ${goal.title}`);
    for (const criterion of goal.acs) lines.push(`   - AC: ${criterion}`);
  });
  return `${lines.join("\n")}\n`;
}

export function createForgeSpecsService(deps: SpecVerbDeps): ForgeSpecsService {
  const {
    db,
    repos,
    writeSpecDoc,
    generateId = () => randomUUID(),
    now = () => new Date().toISOString(),
    transitionGuards = [],
  } = deps;

  function locate(projectKey: string, slug: string): SpecRow {
    const spec = repos.specs.getBySlug(projectKey, slug);
    if (!spec) {
      throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${slug}`, { slug });
    }
    return spec;
  }

  function insertGoalTree(specId: string, goals: GoalInput[], ts: string): void {
    goals.forEach((goal, i) => {
      const goalId = generateId();
      repos.specs.insertGoal({
        id: goalId,
        specId,
        sortKey: i + 1,
        title: goal.title,
        brief: goal.brief ?? null,
        createdAt: ts,
        updatedAt: ts,
      });
      goal.acs.forEach((criterion, j) => {
        repos.specs.insertAc({
          id: generateId(),
          goalId,
          sortKey: j + 1,
          criterion,
          createdAt: ts,
          updatedAt: ts,
        });
      });
    });
  }

  function guardNotArchived(spec: SpecRow): void {
    if (spec.specStatus === "archived") {
      throw new SpecError(
        "ERR_SPEC_ARCHIVED_FROZEN",
        `归档态为冻结快照，写面拒绝：${spec.slug}`,
        { slug: spec.slug },
      );
    }
  }

  return {
    createSpec(input) {
      // ① 校验门（事务外，零落库拒收）
      const projectKey = deriveProjectKey(input.cwd);
      assertGoalsValid(input.goals);
      const tiers = assertTiersValid(input.tiers);
      if (repos.specs.getBySlug(projectKey, input.slug)) {
        throw new SpecError("ERR_SPEC_DUPLICATE_SLUG", `slug 重复：${input.slug}`, {
          slug: input.slug,
        });
      }
      if (repos.docs.relPathTaken(input.docRelPath, projectKey)) {
        throw new SpecError(
          "ERR_SPEC_DUPLICATE_DOC_PATH",
          `文档路径已登记：${input.docRelPath}`,
          { docRelPath: input.docRelPath },
        );
      }
      const ts = now();
      const id = generateId();
      const content = input.docContent ?? renderDefaultSpecDoc(input);
      // ② 单事务：specs → goals → acs → docs 登记 + ③ 同事务内文档文件写缝（写失败整体回滚）
      return withTransaction(db, () => {
        const row: SpecRow = {
          id,
          slug: input.slug,
          title: input.title,
          specStatus: "draft",
          tiers,
          projectKey,
          createdAt: ts,
          updatedAt: ts,
        };
        repos.specs.insert(row);
        insertGoalTree(id, input.goals, ts);
        repos.docs.upsert({
          specId: id,
          relPath: input.docRelPath,
          createdAt: ts,
          updatedAt: ts,
        });
        writeSpecDoc(input.docRelPath, content, projectKey, input.cwd);
        return row;
      });
    },

    updateSpec(input) {
      const projectKey = deriveProjectKey(input.cwd);
      const spec = locate(projectKey, input.slug);
      guardNotArchived(spec);
      const tiers =
        input.tiers !== undefined ? assertTiersValid(input.tiers) : undefined;
      if (input.docRelPath !== undefined && repos.docs.relPathTaken(input.docRelPath, projectKey, spec.id)) {
        throw new SpecError(
          "ERR_SPEC_DUPLICATE_DOC_PATH",
          `文档路径已登记：${input.docRelPath}`,
          { docRelPath: input.docRelPath },
        );
      }
      const ts = now();
      return withTransaction(db, () => {
        repos.specs.updateFields(
          spec.id,
          {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(tiers !== undefined ? { tiers } : {}),
          },
          ts,
        );
        if (input.docRelPath !== undefined) {
          repos.docs.upsert({
            specId: spec.id,
            relPath: input.docRelPath,
            createdAt: spec.createdAt,
            updatedAt: ts,
          });
        }
        return locate(projectKey, input.slug);
      });
    },

    replaceGoals({ cwd, slug, goals }) {
      const projectKey = deriveProjectKey(cwd);
      const spec = locate(projectKey, slug);
      guardNotArchived(spec);
      assertGoalsValid(goals); // 必含 Goal 不变式：删至零行拒写（服务层单点守卫）
      const ts = now();
      return withTransaction(db, () => {
        repos.specs.deleteAcsBySpec(spec.id);
        repos.specs.deleteGoalsBySpec(spec.id);
        insertGoalTree(spec.id, goals, ts);
        repos.specs.updateFields(spec.id, {}, ts);
        return locate(projectKey, slug);
      });
    },

    transitionSpec(input) {
      // actor 值域守卫：仅用户动作通道（plugin-tool / ui）——accepted human-only 纪律锚
      if (input.actor !== "plugin-tool" && input.actor !== "ui") {
        throw new SpecError("ERR_SPEC_ACTOR_INVALID", `非法动作者通道：${input.actor}`, {
          actor: input.actor,
        });
      }
      const projectKey = deriveProjectKey(input.cwd);
      const spec = locate(projectKey, input.slug);
      assertSpecTransitionAllowed(spec.specStatus, input.to);
      const isReject = spec.specStatus === "under-review" && input.to === "draft";
      if (isReject && (!input.note || !input.note.trim())) {
        throw new SpecError("ERR_SPEC_REJECT_NOTE_REQUIRED", "驳回必须附理由（note 必填）", {
          slug: input.slug,
        });
      }
      for (const guard of transitionGuards) {
        guard({ fromStatus: spec.specStatus, toStatus: input.to, actor: input.actor, note: input.note });
      }
      const ts = now();
      // 两写同事务：现值 UPDATE + 台账 append（台账 append-only 由双触发器兜底）
      return withTransaction(db, () => {
        repos.specs.updateStatus(spec.id, input.to, ts);
        repos.transitions.append({
          id: generateId(),
          specId: spec.id,
          fromStatus: spec.specStatus,
          toStatus: input.to,
          note: input.note ?? null,
          actor: input.actor,
          createdAt: ts,
        });
        return locate(projectKey, input.slug);
      });
    },

    listSpecs({ cwd, statusFilter }) {
      const projectKey = deriveProjectKey(cwd);
      return repos.specs.list(projectKey, statusFilter);
    },

    getSpec({ cwd, slug }) {
      const projectKey = deriveProjectKey(cwd);
      const chain = repos.specs.parentChain(projectKey, slug);
      if (!chain) return undefined;
      const doc = repos.docs.getBySpec(chain.spec.id);
      return {
        spec: chain.spec,
        goals: chain.goals.map(({ goal, acs }) => ({
          goal,
          acs: acs.map((a) => ({ id: a.id, criterion: a.criterion, sortKey: a.sortKey })),
        })),
        doc: doc ? { relPath: doc.relPath } : undefined,
        transitions: repos.transitions.listBySpec(chain.spec.id),
      };
    },
  };
}
