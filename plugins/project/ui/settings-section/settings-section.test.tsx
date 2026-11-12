// settings-section 单测 —— 双缝配置节（plugins.bundle.config 键本包名 /
// plugins.detail.section subject 本包名）+ crossBranchRiskDismissed 经 configForms
// revisioned 写入。fake configForms 两态：在场（读写热生效）/ 缺席（不注册 fail-soft）；
// 劣形退默认断言（快照值/worktree 组/位非布尔 → 默认 false）。
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  installWorktreePrefsFace,
  localFormMirror,
  worktreePrefsFaceOf,
  BUNDLE_CONFIG_KEY,
  BUNDLE_CONFIG_SLOT,
  DETAIL_SECTION_ID,
  DETAIL_SECTION_SLOT,
  PROJECT_PKG,
  ProjectBundleConfigSection,
  ProjectDetailSection,
  WorktreePrefsSection,
  registerSettingsSection,
} from "./index.js";
import { dismissedOf, dismissedWriteOf, worktreePatchOf } from "./worktree-prefs.js";
import type { ConfigFormMirror } from "./worktree-prefs.js";

// ── fakes（expert-squad settings-default-options 同型） ──────────

interface RegisteredEntry {
  options: Record<string, unknown>;
  component: unknown;
}

function slotsFake() {
  const registered: RegisteredEntry[] = [];
  const injects: string[] = [];
  return {
    registered,
    injects,
    slots: {
      inject: (key: string, callback: () => (() => void) | undefined) => {
        injects.push(key);
        return callback();
      },
      register: (options: Record<string, unknown>, component: unknown) => {
        registered.push({ options, component });
        return () => undefined;
      },
    },
  };
}

function formMirrorOf(value: unknown, overrides: Partial<ConfigFormMirror> = {}): ConfigFormMirror {
  let snapshot = {
    status: "ready" as "loading" | "ready" | "unavailable",
    value,
    revision: 1 as number | undefined,
    writable: true,
  };
  const mirror: ConfigFormMirror = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    set: () => Promise.resolve(true),
    unset: () => Promise.resolve(true),
    ...overrides,
  };
  (mirror as { __bump(value: unknown): void }).__bump = (next: unknown) => {
    snapshot = { ...snapshot, value: next, revision: (snapshot.revision ?? 0) + 1 };
  };
  return mirror;
}

function configFormsFake(form: ConfigFormMirror | undefined, whileServed?: unknown) {
  return {
    ...(whileServed === undefined ? {} : { whileServed }),
    get: (ns: string) => (ns === SETTINGS_NS ? form : ns === "dsh-forge-project" ? form : undefined),
  };
}

const SETTINGS_NS = "project";
const ctxFake = (services: Record<string, unknown>) => ({ ...services });

// ── 注册装配（双缝） ──────────────────────────────────────────────

describe("registerSettingsSection（plugins.bundle.config / detail.section 双缝）", () => {
  it("configForms 在场：双缝齐挂——bundle.config keyed 键 = 本包名 + detail.section list id", () => {
    const fake = slotsFake();
    const form = formMirrorOf(undefined);
    const disposer = registerSettingsSection(ctxFake({ configForms: configFormsFake(form) }) as never, fake.slots as never);
    expect(fake.injects).toEqual([BUNDLE_CONFIG_SLOT, DETAIL_SECTION_SLOT]);
    expect(fake.registered).toHaveLength(2);
    const keyed = fake.registered[0]!;
    expect(keyed.options.name).toBe(BUNDLE_CONFIG_SLOT);
    expect(keyed.options.key).toBe(PROJECT_PKG);
    expect(BUNDLE_CONFIG_KEY).toBe("@dsh-forge/project");
    expect(keyed.component).toBe(ProjectBundleConfigSection);
    expect((keyed.options.inject as () => { form: ConfigFormMirror })().form).toBe(form);
    const listed = fake.registered[1]!;
    expect(listed.options.name).toBe(DETAIL_SECTION_SLOT);
    expect(listed.options.id).toBe(DETAIL_SECTION_ID);
    expect(listed.options.key).toBeUndefined();
    expect(listed.component).toBe(ProjectDetailSection);
    expect(typeof disposer).toBe("function");
  });

  it("whileServed 在场：候选集覆盖短名与 Host 行 id，namespace 从 served 集解析（读写同源）", () => {
    const fake = slotsFake();
    const form = formMirrorOf(undefined);
    const getByNamespace = vi.fn((ns: string) => (ns === "dsh-forge-project" ? form : undefined));
    const whileServed = vi.fn((_ns: readonly string[], register: (served: ReadonlySet<string>) => () => void) => {
      register(new Set(["dsh-forge-project"]));
    });
    registerSettingsSection(
      ctxFake({ configForms: { whileServed, get: getByNamespace } }) as never,
      fake.slots as never,
    );
    expect(whileServed).toHaveBeenCalledWith(
      expect.arrayContaining(["project", "dsh-forge-project"]),
      expect.any(Function),
    );
    expect(fake.registered).toHaveLength(2);
    expect((fake.registered[0]!.options.inject as () => { form: ConfigFormMirror })().form).toBe(form);
    expect(getByNamespace).toHaveBeenCalledWith("dsh-forge-project");
  });

  it("namespace 未被服务 = 不注册（whileServed 门不放行零落座）", () => {
    const fake = slotsFake();
    const whileServed = vi.fn((_ns: readonly string[], _register: (served: ReadonlySet<string>) => () => void) => () => undefined);
    registerSettingsSection(
      ctxFake({ configForms: { whileServed, get: () => undefined } }) as never,
      fake.slots as never,
    );
    expect(fake.registered).toHaveLength(0);
  });

  it("configForms 缺席 = 插件自有配置承载面降级挂载（双缝齐挂 + 读写读写读回两态成立）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = slotsFake();
    const disposer = registerSettingsSection(ctxFake({}) as never, fake.slots as never);
    expect(fake.injects).toEqual([BUNDLE_CONFIG_SLOT, DETAIL_SECTION_SLOT]);
    expect(fake.registered).toHaveLength(2);
    expect(typeof disposer).toBe("function");
    const form = (fake.registered[0]!.options.inject as () => { form: ConfigFormMirror })().form;
    expect(form).toBeDefined();
    // 写径读回：插件域持久化承载面（注入记忆存储——降级面与 serve 在场形态行为对齐）
    const backing = new Map<string, string>();
    const local = localFormMirror({ getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v), removeItem: (k) => backing.delete(k) });
    expect(local.getSnapshot().status).toBe("ready");
    expect(local.getSnapshot().writable).toBe(true);
    const write = dismissedWriteOf(local, { attempts: 1, delayMs: 0 })!;
    await expect(write(true)).resolves.toBe(true);
    expect(dismissedOf(local.getSnapshot().value)).toBe(true);
    const reread = localFormMirror({ getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v), removeItem: (k) => backing.delete(k) });
    expect(dismissedOf(reread.getSnapshot().value)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("劣形 configForms（get 非函数）= 视同缺席走插件自有承载面降级挂载", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = slotsFake();
    const disposer = registerSettingsSection(ctxFake({ configForms: { nope: 1 } }) as never, fake.slots as never);
    expect(fake.registered).toHaveLength(2);
    expect(typeof disposer).toBe("function");
    warn.mockRestore();
  });

  it("worktreePrefsFaceOf：configForms 缺席 = 插件自有承载面兜底（取法门读路径两态对齐）", () => {
    installWorktreePrefsFace(() => undefined);
    const backing = new Map<string, string>();
    const stub = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => backing.set(k, v),
      removeItem: (k: string) => backing.delete(k),
    };
    const prior = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = stub;
    try {
      const face = worktreePrefsFaceOf();
      expect(face).toBeDefined();
      expect(face!.getSnapshot().status).toBe("ready");
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = prior;
    }
  });

  it("dsh.client.inject 零消费零 inject 边：client 插件面不声明 configForms（settings-unification 圆桌处方）", async () => {
    const { projectClient } = await import("../index.js");
    expect(projectClient.inject).not.toContain("configForms");
  });
});

// ── 双缝消费组件（subject/view 门控） ────────────────────────────

describe("ProjectDetailSection / ProjectBundleConfigSection（缝消费组件）", () => {
  it("detail.section：本包 bundle 详情页 subject 渲染配置节", () => {
    const form = formMirrorOf({ worktree: { crossBranchRiskDismissed: true } });
    const html = renderToStaticMarkup(
      <ProjectDetailSection subject={{ kind: "bundle", pkg: { name: PROJECT_PKG } }} form={form} />,
    );
    expect(html).toContain("data-dswf-settings=\"project-worktree\"");
    expect(html).toContain("checked");
  });

  it("detail.section：他包 subject / item subject / 缺席 = render null（双缝同页不重复）", () => {
    const form = formMirrorOf(undefined);
    expect(renderToStaticMarkup(<ProjectDetailSection subject={{ kind: "bundle", pkg: { name: "@dsh-forge/other" } }} form={form} />)).toBe("");
    expect(renderToStaticMarkup(<ProjectDetailSection subject={{ kind: "item", pkg: { name: PROJECT_PKG } }} form={form} />)).toBe("");
    expect(renderToStaticMarkup(<ProjectDetailSection form={form} />)).toBe("");
  });

  it("bundle.config keyed 缝：owner props（view）透传直渲染本包配置节", () => {
    const form = formMirrorOf(undefined);
    const html = renderToStaticMarkup(<ProjectBundleConfigSection view="page" form={form} />);
    expect(html).toContain("data-dswf-settings=\"project-worktree\"");
  });
});

// ── 配置节组件（fake configForms 两态 + 劣形退默认） ──────────────

describe("WorktreePrefsSection（在场读写热生效 / 缺席不渲染 / 劣形退默认）", () => {
  it("form 缺席 = render null（不悬空）", () => {
    expect(renderToStaticMarkup(<WorktreePrefsSection />)).toBe("");
  });

  it("快照 ready：位 true = 勾选呈现；劣形退默认（值/worktree 组/位非布尔 = false 不勾选）", () => {
    const on = renderToStaticMarkup(<WorktreePrefsSection form={formMirrorOf({ worktree: { crossBranchRiskDismissed: true } })} />);
    expect(on).toContain("checked");
    for (const bad of [undefined, "nope", { worktree: "nope" }, { worktree: { crossBranchRiskDismissed: "yes" } }]) {
      const html = renderToStaticMarkup(<WorktreePrefsSection form={formMirrorOf(bad)} />);
      expect(html).not.toContain("checked");
    }
  });

  it("快照 loading/unavailable = 降级一行提示（data-cfg-state 锚），零控件悬空", () => {
    const loading = renderToStaticMarkup(<WorktreePrefsSection form={formMirrorOf(undefined, { getSnapshot: () => ({ status: "loading", value: undefined, revision: undefined, writable: false }) })} />);
    expect(loading).toContain('data-cfg-state="loading"');
    const unavailable = renderToStaticMarkup(<WorktreePrefsSection form={formMirrorOf(undefined, { getSnapshot: () => ({ status: "unavailable", value: undefined, revision: undefined, writable: false }) })} />);
    expect(unavailable).toContain('data-cfg-state="unavailable"');
  });

  it("快照换代热生效：revision 递增后同 form 重渲染呈新值（无重启生效）", () => {
    const form = formMirrorOf(undefined);
    expect(renderToStaticMarkup(<WorktreePrefsSection form={form} />)).not.toContain("checked");
    (form as unknown as { __bump(v: unknown): void }).__bump({ worktree: { crossBranchRiskDismissed: true } });
    expect(renderToStaticMarkup(<WorktreePrefsSection form={form} />)).toContain("checked");
  });
});

// ── 纯逻辑（读取劣形退默认 + revisioned 写径） ────────────────────

describe("dismissedOf / worktreePatchOf（纯逻辑）", () => {
  it("劣形退默认 false", () => {
    expect(dismissedOf(undefined)).toBe(false);
    expect(dismissedOf(null)).toBe(false);
    expect(dismissedOf("x")).toBe(false);
    expect(dismissedOf({})).toBe(false);
    expect(dismissedOf({ worktree: {} })).toBe(false);
    expect(dismissedOf({ worktree: { crossBranchRiskDismissed: 1 } })).toBe(false);
  });

  it("位 true 读通；worktreePatchOf true 落位 / false 键归缺（回退默认不抑制），prior 其余键保留", () => {
    expect(dismissedOf({ worktree: { crossBranchRiskDismissed: true } })).toBe(true);
    expect(worktreePatchOf(undefined, true)).toEqual({ crossBranchRiskDismissed: true });
    expect(worktreePatchOf({ crossBranchRiskDismissed: true, other: 1 }, false)).toEqual({ other: 1 });
    expect(worktreePatchOf({ crossBranchRiskDismissed: false }, true)).toEqual({ crossBranchRiskDismissed: true });
  });
});

describe("dismissedWriteOf（configForms revisioned 写径）", () => {
  it("写被接受 = 落位整 worktree 字段（fresh 快照合并）", async () => {
    const form = formMirrorOf({ worktree: { crossBranchRiskDismissed: false, other: 1 } });
    const set = vi.fn(() => Promise.resolve(true));
    (form as { set: typeof set }).set = set;
    const write = dismissedWriteOf(form, { attempts: 1, delayMs: 0 })!;
    await write(true);
    expect(set).toHaveBeenCalledWith("worktree", { crossBranchRiskDismissed: true, other: 1 });
  });

  it("写被拒 = fresh revision 快照重合成重试；全耗尽 = false（不静默丢写）", async () => {
    const form = formMirrorOf({ worktree: {} });
    let calls = 0;
    const set = vi.fn(() => {
      calls += 1;
      return Promise.resolve(calls >= 3);
    });
    (form as { set: typeof set }).set = set;
    const write = dismissedWriteOf(form, { attempts: 5, delayMs: 0 })!;
    const accepted = await write(true);
    expect(accepted).toBe(true);
    expect(set).toHaveBeenCalledTimes(3);
    const allRejectedForm = formMirrorOf({ worktree: {} });
    const rejected = vi.fn(() => Promise.resolve(false));
    (allRejectedForm as { set: typeof rejected }).set = rejected;
    const writeAll = dismissedWriteOf(allRejectedForm, { attempts: 2, delayMs: 0 })!;
    await expect(writeAll(true)).resolves.toBe(false);
    expect(rejected).toHaveBeenCalledTimes(2);
  });

  it("快照不可写（status 非 ready / writable false）= false 不写", async () => {
    const form = formMirrorOf(undefined, {
      getSnapshot: () => ({ status: "unavailable", value: undefined, revision: undefined, writable: false }),
    });
    const write = dismissedWriteOf(form, { attempts: 1, delayMs: 0 })!;
    await expect(write(true)).resolves.toBe(false);
  });
});
