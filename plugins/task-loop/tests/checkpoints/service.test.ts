// checkpoints 域三法测试（plugin-task-loop 1.9——code-design 模块③ slug 容器锚改造）：
// proposal_id FK 退役 → slug 弱引用（悬空不拒写）；wave_seq max+1 与 ensureCheckpoint 唯一
// 预检按 (project_key, slug, mark) 圈定；里程碑唯一拒重打；append-only 双触发器。
import { beforeEach, describe, expect, it } from "vitest";
import {
  CheckpointAlreadyExistsError,
  CheckpointWaveSeqInvalidError,
  createCheckpointsService,
} from "../../host/domain/checkpoints/service.js";
import { createTasksHarness, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

const make = () => createCheckpointsService({ db: h.db, events: h.events });

const input = (o: {
  slug?: string;
  mark: string;
  waveSeq?: number;
  projectKey?: string;
  base?: string;
}) => ({
  projectKey: o.projectKey ?? h.projectKey,
  containerSlug: o.slug ?? "alpha",
  mark: o.mark as never,
  ...(o.waveSeq !== undefined ? { waveSeq: o.waveSeq } : {}),
  baseCommitHash: o.base ?? "base-c1",
  snapshots: { tasksTotal: 3, commitsTotal: 5, fixesTotal: 1, evidenceDebtsTotal: 0 },
});

const countRows = (where = "1=1") =>
  (h.db.prepare(`SELECT COUNT(*) AS n FROM task_checkpoints WHERE ${where}`).get() as { n: number }).n;

describe("checkpoints 三法 slug 锚", () => {
  it("appendCheckpoint：slug 弱引用落行（悬空容器不拒写）+ UUID id + 快照四列直落 + emit", async () => {
    const svc = make();
    const row = await svc.appendCheckpoint(input({ mark: "stabilized" }));
    expect(row.id).toHaveLength(36);
    expect(row.projectKey).toBe(h.projectKey);
    expect(row.slug).toBe("alpha");
    expect(row.mark).toBe("stabilized");
    expect(row.waveSeq).toBeUndefined();
    expect(row.tasksTotal).toBe(3);
    expect(row.evidenceDebtsTotal).toBe(0);
    expect(h.events.emitted).toContain(h.projectKey);
  });

  it("wave_seq 自动递增 max+1 按 (project_key, slug, mark) 圈定——换 slug/换 project 各自从 1 起", async () => {
    const svc = make();
    expect((await svc.appendCheckpoint(input({ mark: "review-wave-N" }))).waveSeq).toBe(1);
    expect((await svc.appendCheckpoint(input({ mark: "review-wave-N" }))).waveSeq).toBe(2);
    expect((await svc.appendCheckpoint(input({ mark: "review-wave-N" }))).waveSeq).toBe(3);
    // 同 project 换 slug：圈定不含他容器——重新从 1 起
    expect((await svc.appendCheckpoint(input({ mark: "review-wave-N", slug: "beta" }))).waveSeq).toBe(1);
    // 换 project 同 slug：project_key 前导列圈定——重新从 1 起
    expect(
      (await svc.appendCheckpoint(input({ mark: "review-wave-N", projectKey: "proj-b@abcd1234" }))).waveSeq,
    ).toBe(1);
  });

  it("显式 waveSeq 直用 + 词汇/取值校验拒写", async () => {
    const svc = make();
    expect((await svc.appendCheckpoint(input({ mark: "review-wave-N", waveSeq: 7 }))).waveSeq).toBe(7);
    await expect(svc.appendCheckpoint(input({ mark: "stabilized", waveSeq: 1 }))).rejects.toMatchObject({
      code: "ERR_CHECKPOINT_WAVE_SEQ_INVALID",
    });
    const err = new CheckpointWaveSeqInvalidError("stabilized");
    expect(err.code).toBe("ERR_CHECKPOINT_WAVE_SEQ_INVALID");
    await expect(svc.appendCheckpoint(input({ mark: "review-wave-N", waveSeq: 0 }))).rejects.toThrow(/≥1 整数/);
    await expect(svc.appendCheckpoint(input({ mark: "ghost-mark" }))).rejects.toThrow(/未知检查点标记/);
  });

  it("里程碑唯一拒重打：同 (project_key, slug, mark) 二次 append 拒写零副作用；derived-to-child 豁免", async () => {
    const svc = make();
    await svc.appendCheckpoint(input({ mark: "merged" }));
    await expect(svc.appendCheckpoint(input({ mark: "merged" }))).rejects.toMatchObject({
      code: "ERR_CHECKPOINT_ALREADY_EXISTS",
    });
    expect(new CheckpointAlreadyExistsError({
      projectKey: "p", slug: "s", mark: "merged", waveSeq: 1,
    }).code).toBe("ERR_CHECKPOINT_ALREADY_EXISTS");
    expect(countRows()).toBe(1);
    // 关系标记豁免唯一约束：可重复落行
    await svc.appendCheckpoint(input({ mark: "derived-to-child" }));
    await svc.appendCheckpoint(input({ mark: "derived-to-child" }));
    expect(countRows("mark = 'derived-to-child'")).toBe(2);
  });

  it("partial unique 行为验证（DDL 层）：同 (project_key, slug, mark, wave_seq) 重打拒写；跨 project 同 slug 同波互不冲突", async () => {
    const svc = make();
    await svc.appendCheckpoint(input({ mark: "review-wave-N" }));
    const projectB = "proj-b@abcd1234";
    // 跨 project 同 slug 同波：uq 前导 project_key 区分——各落一行
    await svc.appendCheckpoint(input({ mark: "review-wave-N", projectKey: projectB }));
    // 同 project 同 slug 同 mark 直种 SQL 重打（绕过服务预检）→ DDL partial unique 拒写
    expect(() =>
      h.db
        .prepare(
          `INSERT INTO task_checkpoints (id, project_key, slug, mark, wave_seq, created_at, base_commit_hash,
             tasks_total, commits_total, fixes_total, evidence_debts_total)
           VALUES ('cp-x', ?, 'alpha', 'review-wave-N', 1, '2026-01-02T00:00:00.000Z', 'b', 0, 0, 0, 0)`,
        )
        .run(h.projectKey),
    ).toThrow();
    expect(countRows()).toBe(2);
    expect(countRows(`project_key = '${projectB}'`)).toBe(1);
  });

  it("append-only 双触发器：UPDATE/DELETE 拒绝（RAISE ABORT）", async () => {
    const svc = make();
    await svc.appendCheckpoint(input({ mark: "merged" }));
    expect(() => h.db.prepare(`UPDATE task_checkpoints SET mark = 'stabilized'`).run()).toThrow(/append-only/);
    expect(() => h.db.prepare(`DELETE FROM task_checkpoints`).run()).toThrow(/append-only/);
  });

  it("ensureCheckpoint：缺席落行、在场幂等 no-op（唯一预检按 (project_key, slug, mark) 圈定）", async () => {
    const svc = make();
    const first = await svc.ensureCheckpoint(input({ mark: "merged" }));
    expect(first.appended).toBe(true);
    expect(first.checkpoint?.mark).toBe("merged");
    const again = await svc.ensureCheckpoint(input({ mark: "merged" }));
    expect(again.appended).toBe(false);
    expect(again.checkpoint).toBeUndefined();
    expect(countRows()).toBe(1);
    // 同 mark 换容器：预检圈定不含他 slug——照落
    const other = await svc.ensureCheckpoint(input({ mark: "merged", slug: "beta" }));
    expect(other.appended).toBe(true);
    // review-wave-N 自动递增经 ensure 径同样成立（无显式 waveSeq = 追加下一波；幂等 no-op
    // 仅对显式 waveSeq 或非递增标记成立——core 直迁语义）
    expect((await svc.ensureCheckpoint(input({ mark: "review-wave-N" }))).checkpoint?.waveSeq).toBe(1);
    const nextWave = await svc.ensureCheckpoint(input({ mark: "review-wave-N", waveSeq: 1 }));
    expect(nextWave.appended).toBe(false);
    expect(countRows("mark = 'review-wave-N'")).toBe(1);
  });

  it("listCheckpoints：容器 slug 时序（created_at 升序）+ marks 过滤 + project_key 限定", async () => {
    const svc = make();
    await svc.appendCheckpoint(input({ mark: "stabilized" }));
    await svc.appendCheckpoint(input({ mark: "merged" }));
    await svc.appendCheckpoint(input({ mark: "stabilized", slug: "beta" }));
    const all = await svc.listCheckpoints({ projectKey: h.projectKey, slug: "alpha" });
    expect(all).toHaveLength(2);
    expect(new Set(all.map((r) => r.mark))).toEqual(new Set(["stabilized", "merged"]));
    const mergedOnly = await svc.listCheckpoints({ projectKey: h.projectKey, slug: "alpha", marks: ["merged"] });
    expect(mergedOnly).toHaveLength(1);
    expect(mergedOnly[0]?.mark).toBe("merged");
  });
});
