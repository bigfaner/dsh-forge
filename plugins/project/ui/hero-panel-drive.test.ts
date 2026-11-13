// hero 空态自判定驱动单测（bug 295223da——无壳官方宿主 hero 面板零呈现：壳侧
// ShellHost 选中驱动不在场，HeroEmpty CTA 永不可达）。断言面：
//   - heroEmptySelfDriveOf：空态自判定纯推导（activePanelId 缺省 + 一次性守卫）；
//   - shellDriverPresentOf：壳驱动在场探测（__DSH_FORGE_HOST_PLUGINS__ 页内缝）；
//   - startHeroEmptySelfDrive：零项目 → selectPanel('dswf-hero') 单发；有项目 /
//     壳在场 / layout 缺席 / selectPanel 抛错 = 不驱动（fail-soft 留痕）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HERO_EMPTY_DRIVE_DIAG_PREFIX,
  heroEmptySelfDriveOf,
  shellDriverPresentOf,
  startHeroEmptySelfDrive,
  type HeroLayoutFace,
} from './hero-panel-drive.js'

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['__DSH_FORGE_HOST_PLUGINS__']
})

describe('heroEmptySelfDriveOf 空态自判定纯推导', () => {
  it('官方会话面板缺省（activePanelId null）且未驱动过 → 驱动进 hero', () => {
    expect(heroEmptySelfDriveOf(null, false)).toBe(true)
  })

  it('面板信息快照形状漂移（undefined）按官方缺省口径 → 驱动', () => {
    expect(heroEmptySelfDriveOf(undefined, false)).toBe(true)
  })

  it('已驱动过（一次性守卫）→ 不再驱动', () => {
    expect(heroEmptySelfDriveOf(null, true)).toBe(false)
  })

  it('用户已在其它面板（知识面板）→ 不与导航争用', () => {
    expect(heroEmptySelfDriveOf('dswf-knowledge', false)).toBe(false)
  })

  it('已在 hero 面板 → 不重复驱动', () => {
    expect(heroEmptySelfDriveOf('dswf-hero', false)).toBe(false)
  })
})

describe('shellDriverPresentOf 壳驱动在场探测', () => {
  it('页内缝缺席（无壳官方宿主）→ false', () => {
    expect(shellDriverPresentOf(globalThis as never)).toBe(false)
  })

  it('页内缝在场（壳宿主 bootShell 已发布）→ true', () => {
    ;(globalThis as Record<string, unknown>)['__DSH_FORGE_HOST_PLUGINS__'] = { knowledge: true }
    expect(shellDriverPresentOf(globalThis as never)).toBe(true)
  })
})

describe('startHeroEmptySelfDrive 空态自判定装配', () => {
  function layoutFace(activePanelId: string | null): HeroLayoutFace & { selectPanel: ReturnType<typeof vi.fn> } {
    return {
      selectPanel: vi.fn(),
      panelInfo: { getSnapshot: () => ({ activePanelId }) },
    }
  }

  it('零项目 + 官方缺省面板 → selectPanel(dswf-hero) 单发，返回 true', async () => {
    const layout = layoutFace(null)
    const driven = await startHeroEmptySelfDrive({
      layoutOf: () => layout,
      projectsCount: async () => 0,
    })
    expect(driven).toBe(true)
    expect(layout.selectPanel).toHaveBeenCalledTimes(1)
    expect(layout.selectPanel).toHaveBeenCalledWith('dswf-hero')
  })

  it('已有项目 → 不驱动', async () => {
    const layout = layoutFace(null)
    const driven = await startHeroEmptySelfDrive({
      layoutOf: () => layout,
      projectsCount: async () => 2,
    })
    expect(driven).toBe(false)
    expect(layout.selectPanel).not.toHaveBeenCalled()
  })

  it('壳驱动在场（壳宿主）→ 跳过自判定（ShellHost 单驱动）', async () => {
    ;(globalThis as Record<string, unknown>)['__DSH_FORGE_HOST_PLUGINS__'] = {}
    const projectsCount = vi.fn(async () => 0)
    const driven = await startHeroEmptySelfDrive({
      layoutOf: () => layoutFace(null),
      projectsCount,
    })
    expect(driven).toBe(false)
    expect(projectsCount).not.toHaveBeenCalled()
  })

  it('layout 缺席（宿主形状漂移）→ 不驱动 + 诊断留痕', async () => {
    const diag = vi.fn()
    const driven = await startHeroEmptySelfDrive({
      layoutOf: () => undefined,
      projectsCount: async () => 0,
      diag,
    })
    expect(driven).toBe(false)
    expect(diag).toHaveBeenCalledWith(expect.stringContaining(HERO_EMPTY_DRIVE_DIAG_PREFIX))
  })

  it('selectPanel 抛错（面板 id 未注册瞬态）→ fail-soft 留痕不炸', async () => {
    const diag = vi.fn()
    const layout = layoutFace(null)
    layout.selectPanel.mockImplementation(() => {
      throw new Error('panel not registered')
    })
    const driven = await startHeroEmptySelfDrive({
      layoutOf: () => layout,
      projectsCount: async () => 0,
      diag,
    })
    expect(driven).toBe(false)
    expect(diag).toHaveBeenCalledWith(expect.stringContaining(HERO_EMPTY_DRIVE_DIAG_PREFIX))
  })

  it('项目数查询失败（remote 面缺席）→ fail-soft 留痕不炸', async () => {
    const diag = vi.fn()
    const driven = await startHeroEmptySelfDrive({
      layoutOf: () => layoutFace(null),
      projectsCount: async () => {
        throw new Error('remote face absent')
      },
      diag,
    })
    expect(driven).toBe(false)
    expect(diag).toHaveBeenCalledWith(expect.stringContaining(HERO_EMPTY_DRIVE_DIAG_PREFIX))
  })
})
