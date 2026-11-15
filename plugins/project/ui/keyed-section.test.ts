// keyed-section 单测 —— keyed section 插槽扩展点（tab keyed 占用者模式泛化）：
// 登记契约（slot+key 两段注册 = 官方 slots.inject 声明缝 → slots.register 落座）、
// 劣形 slots（inject/register 缺席、register 抛错）fail-soft 降级、联合释放器级联、
// M2 预留接口（知识库目录节——settings-unification 圆桌裁定：whileServed 门控 +
// 宿主在场性声明，接口形状 pin）。
import { describe, expect, it, vi } from "vitest";
import {
  KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT,
  PROJECT_SECTION_HOST_SERVICE,
  registerKeyedSection,
  safeRegisterSection,
  type KeyedSectionRegistration,
} from "./keyed-section.js";

interface RegisteredEntry {
  options: Record<string, unknown>;
  component: unknown;
}

function slotsFake(overrides: Record<string, unknown> = {}) {
  const registered: RegisteredEntry[] = [];
  const injects: string[] = [];
  const base = {
    inject: (key: string, callback: () => (() => void) | undefined) => {
      injects.push(key);
      return callback();
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      registered.push({ options, component });
      return () => undefined;
    },
  };
  return { registered, injects, slots: { ...base, ...overrides } };
}

const REG: KeyedSectionRegistration = {
  slot: "sidebar.right.pane.tab",
  key: "dswf-bug",
  component: { id: "component-sentinel" },
};

describe("registerKeyedSection（tab keyed 占用者两段注册泛化）", () => {
  it("在场 slots：经 slots.inject(slot) 声明缝挂 register（slot/key/component 逐字透传）", () => {
    const fake = slotsFake();
    const disposer = registerKeyedSection(fake.slots, REG);
    expect(fake.injects).toEqual(["sidebar.right.pane.tab"]);
    expect(fake.registered).toHaveLength(1);
    const { options, component } = fake.registered[0]!;
    expect(options.name).toBe("sidebar.right.pane.tab");
    expect(options.key).toBe("dswf-bug");
    expect(component).toBe(REG.component);
    expect(typeof disposer).toBe("function");
  });

  it("list 型节（id/order/label）与 inject face 逐字透传", () => {
    const fake = slotsFake();
    const inject = () => ({ form: "form-sentinel" });
    registerKeyedSection(fake.slots, {
      slot: "plugins.detail.section",
      id: "project-worktree-preferences",
      order: 10,
      label: "Worktree",
      inject,
      component: REG.component,
    });
    const options = fake.registered[0]!.options;
    expect(options.id).toBe("project-worktree-preferences");
    expect(options.order).toBe(10);
    expect(options.label).toBe("Worktree");
    expect(options.key).toBeUndefined();
    expect((options.inject as typeof inject)().form).toBe("form-sentinel");
  });

  it("children 槽声明表逐字透传（宿主单点声明缝——官方 SlotCore.register children 协议）", () => {
    const fake = slotsFake();
    const children = { "project.section.knowledge-dir": { kind: "keyed", scope: "root" } };
    registerKeyedSection(fake.slots, { ...REG, children });
    const options = fake.registered[0]!.options;
    expect(options.children).toBe(children);
  });

  it("children 缺省 = 注册 options 零 children 键（登记面形状不变）", () => {
    const fake = slotsFake();
    registerKeyedSection(fake.slots, REG);
    expect("children" in fake.registered[0]!.options).toBe(false);
  });

  it("inject 缺席（宿主形状漂移）= fail-soft 不注册（warn 留痕）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = slotsFake({ inject: undefined });
    const disposer = registerKeyedSection(fake.slots, REG);
    expect(disposer).toBeUndefined();
    expect(fake.registered).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("slots 整体缺席 = fail-soft 不注册", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(registerKeyedSection(undefined, REG)).toBeUndefined();
    expect(registerKeyedSection({} as never, REG)).toBeUndefined();
    warn.mockRestore();
  });

  it("register 抛错 = 只降本行（console.error 留痕，不外溢炸装配）", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = slotsFake({ register: () => { throw new Error("boom"); } });
    const disposer = registerKeyedSection(fake.slots, REG);
    expect(disposer).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe("safeRegisterSection（单行登记守卫）", () => {
  it("register 缺席 = undefined", () => {
    expect(safeRegisterSection({}, { name: "s" }, null)).toBeUndefined();
  });

  it("register 在场 = 透传返回释放器", () => {
    const disposer = (): void => undefined;
    const out = safeRegisterSection(
      { register: () => disposer },
      { name: "s", key: "k" },
      REG.component,
    );
    expect(out).toBe(disposer);
  });
});

describe("M2 预留接口（知识库目录节——settings-unification 圆桌裁定形状 pin）", () => {
  it("宿主在场性声明服务名常量（knowledge 消费方 apply 期现查锚）", () => {
    expect(PROJECT_SECTION_HOST_SERVICE).toBe("project.sections");
  });

  it("知识库目录节槽名常量预留在位（M2 挂载点；本批只留契约不实现）", () => {
    expect(KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT).toBe("project.section.knowledge-dir");
  });
});
