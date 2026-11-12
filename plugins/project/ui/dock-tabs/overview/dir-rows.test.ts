// dir-rows 单测（基本信息区 2026-11-13——五行键集 pin + dirHeadRows 投影 + 标签单源）。
// useDirFactRows 装载 hook = effect 编排胶水（Node 测面外，归装配 + e2e——overview-data
// 同口径）。
import { describe, expect, it } from 'vitest'
import { DIR_FACTS_ROW_KEYS, dirFactRowLabel, dirHeadRows } from './dir-rows.js'
import type { DirFactRow } from '@dsh-forge/contracts'

const ROWS: readonly DirFactRow[] = [
  { dirKey: 'workspaceRoot', dir: 'Z:\\ws\\demo', description: '' },
  { dirKey: 'forgeDir', dir: 'Z:\\ws\\demo\\.forge', description: '' },
  { dirKey: 'forge.docs_root', dir: 'Z:\\ws\\demo\\.forge\\docs', description: '' },
  { dirKey: 'forge.task_home', dir: 'D:\\tasks\\demo@abcd1234', description: '' },
  { dirKey: 'forge.worktrees', dir: 'Z:\\ws\\demo\\.forge\\worktrees', description: '' },
]

describe('DIR_FACTS_ROW_KEYS 键集 pin（与 host 半 DIR_FACTS_PRESENTED_KEYS + 项目行两键成对）', () => {
  it('五键有序；forge.tmp 与 forge.project_home 不列示', () => {
    expect([...DIR_FACTS_ROW_KEYS]).toEqual(['workspaceRoot', 'forgeDir', 'forge.docs_root', 'forge.task_home', 'forge.worktrees'])
    expect(DIR_FACTS_ROW_KEYS).not.toContain('forge.tmp')
    expect(DIR_FACTS_ROW_KEYS).not.toContain('forge.project_home')
  })
})

describe('dirHeadRows（UI 只渲染零拼接——值恒为 host 下发原样）', () => {
  it('五标签有序投影', () => {
    expect(dirHeadRows(ROWS)).toEqual([
      { label: '工作区根', value: 'Z:\\ws\\demo' },
      { label: '.forge 目录', value: 'Z:\\ws\\demo\\.forge' },
      { label: '文档位置', value: 'Z:\\ws\\demo\\.forge\\docs' },
      { label: '任务清单', value: 'D:\\tasks\\demo@abcd1234' },
      { label: '派发工作树区', value: 'Z:\\ws\\demo\\.forge\\worktrees' },
    ])
  })

  it('行缺席 / dir null = 「—」；rows undefined = 全「—」', () => {
    const partial: readonly DirFactRow[] = [
      ROWS[0]!,
      { dirKey: 'forgeDir', dir: null, description: '' },
    ]
    const out = dirHeadRows(partial)
    expect(out[0]?.value).toBe('Z:\\ws\\demo')
    expect(out[1]?.value).toBe('—')
    expect(out[2]?.value).toBe('—')
    expect(dirHeadRows(undefined).every((r) => r.value === '—')).toBe(true)
  })

  it('dirFactRowLabel 单源（overview-data overviewHeadRows 消费同表）', () => {
    expect(dirFactRowLabel('forge.task_home')).toBe('任务清单')
  })
})
