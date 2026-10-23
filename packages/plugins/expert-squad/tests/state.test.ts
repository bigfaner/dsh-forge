// state 单元测试（tech-design §13 D4 / AD2 / §10.1）：启停状态经 ctx.storage
// 自有 domain 表，key = disabled/<canonicalWorkspacePath>/<expertId>——
// 同一专家 A 工作区禁用、B 工作区可用的工作区隔离 + 真实 domain 层落盘持久性。

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { Storage } from "@deepseek-ai/dsh-storage";
import * as StorageDomain from "@deepseek-ai/dsh-storage-domain";
import * as StorageJson from "@deepseek-ai/dsh-storage-json";
import { afterAll, describe, expect, it } from "vitest";
import {
  ExpertSquadState,
  EXPERT_STATE_DOMAIN,
  disabledKey,
  expertSquadStateDomainSpec,
  workspaceParamSchema,
} from "../src/state.js";

const tmpRoots: string[] = [];

afterAll(async () => {
  await Promise.all(tmpRoots.map((r) => rm(r, { recursive: true, force: true })));
});

/** 真实 storage hub + json backend + domain facility（官方插件正门装配）。 */
async function makeState(
  sharedDir?: string,
): Promise<{ state: ExpertSquadState; root: Context; dir: string }> {
  const dir = sharedDir ?? (await mkdtemp(join(tmpdir(), "expert-squad-state-")));
  tmpRoots.push(dir);
  const root = new Context();
  await root.plugin(Storage);
  await root.plugin(StorageJson, { root: dir });
  await root.plugin(StorageDomain, { backend: "json" });
  const domain = await root.storage.domain.open(expertSquadStateDomainSpec);
  return { state: new ExpertSquadState(domain), root, dir };
}

describe("expert-squad state domain spec", () => {
  it("自有 domain：名字 + disabled 单表（§13 D4）", () => {
    expect(EXPERT_STATE_DOMAIN).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(expertSquadStateDomainSpec.name).toBe(EXPERT_STATE_DOMAIN);
    expect(Object.keys(expertSquadStateDomainSpec.tables)).toEqual(["disabled"]);
  });

  it("key = disabled/<canonicalWorkspacePath>/<expertId>", () => {
    expect(disabledKey("C:\\ws\\a", "code-reviewer")).toBe(
      "disabled/C:\\ws\\a/code-reviewer",
    );
  });

  it("fetch 路由 workspace 参数 zod 门：空串拒绝", () => {
    expect(workspaceParamSchema.safeParse("C:\\ws").success).toBe(true);
    expect(workspaceParamSchema.safeParse("").success).toBe(false);
    expect(workspaceParamSchema.safeParse(42).success).toBe(false);
  });
});

describe("启停状态工作区隔离（AD2）", () => {
  it("同专家 A 工作区禁用、B 工作区可用", async () => {
    const { state } = await makeState();
    const workspaceA = await mkdtemp(join(tmpdir(), "expert-squad-ws-a-"));
    const workspaceB = await mkdtemp(join(tmpdir(), "expert-squad-ws-b-"));
    tmpRoots.push(workspaceA, workspaceB);

    expect(await state.isDisabled(workspaceA, "code-reviewer")).toBe(false);
    expect(await state.isDisabled(workspaceB, "code-reviewer")).toBe(false);

    await state.setEnabled(workspaceA, "code-reviewer", false);
    expect(await state.isDisabled(workspaceA, "code-reviewer")).toBe(true);
    expect(await state.isDisabled(workspaceB, "code-reviewer")).toBe(false);
    expect(await state.isDisabled(workspaceA, "other-expert")).toBe(false);

    await state.setEnabled(workspaceB, "code-reviewer", false);
    expect(await state.isDisabled(workspaceB, "code-reviewer")).toBe(true);

    await state.setEnabled(workspaceA, "code-reviewer", true);
    expect(await state.isDisabled(workspaceA, "code-reviewer")).toBe(false);
    expect(await state.isDisabled(workspaceB, "code-reviewer")).toBe(true);
    await state.close();
  });

  it("canonicalWorkspacePath 判据：同一目录不同拼写 → 同一隔离键", async () => {
    const { state } = await makeState();
    const workspace = await mkdtemp(join(tmpdir(), "expert-squad-ws-c-"));
    tmpRoots.push(workspace);
    const dotted = join(workspace, "sub", "..");

    await state.setEnabled(dotted, "code-reviewer", false);
    expect(await state.isDisabled(workspace, "code-reviewer")).toBe(true);
    await state.close();
  });

  it("落盘持久：重开 domain 后禁用状态仍在（storage 不可用降级属 tools/routes 装配面）", async () => {
    const first = await makeState();
    const workspace = await mkdtemp(join(tmpdir(), "expert-squad-ws-d-"));
    tmpRoots.push(workspace);
    await first.state.setEnabled(workspace, "code-reviewer", false);
    await first.state.close();

    const second = await makeState(first.dir);
    // 同一中转目录 → 同一 domain 单元 → 记录恢复
    expect(await second.state.isDisabled(workspace, "code-reviewer")).toBe(true);
    await second.state.close();
  });
});
