// dir-rows 单测（基本信息区 spec §2.7——显示规则 pin：隐藏集 + 标签表 + 行取自目录事实
// 服务零写死键清单）。useDirFactRows 装载 hook = effect 编排胶水（Node 测面外，归装配
// + e2e——overview-data 同口径）。
import { describe, expect, it } from 'vitest'
import { dirFactRowLabel, dirHeadRows } from './dir-rows.js'
import type { DirFactRow } from '@dsh-forge/contracts'

const ROWS: readonly DirFactRow[] = [
  { dirKey: 'workspaceRoot', dir: 'Z:\\ws\\demo', description: '' },
  { dirKey: 'forgeDir', dir: 'Z:\\ws\\demo\\.forge', description: '' },
  { dirKey: 'forge.home', dir: 'C:\\dsh\\forge', description: '' },
  { dirKey: 'project.tmp_dir', dir: 'Z:\\ws\\demo\\.forge\\tmp', description: '' },
  { dirKey: 'knowledge.global', dir: 'C:\\dsh\\forge\\knowledge\\global', description: '' },
  { dirKey: 'project.runtime_dir', dir: 'C:\\dsh\\forge\\projects\\demo', description: '' },
  { dirKey: 'project.docs_dir', dir: 'Z:\\ws\\demo\\.forge\\docs', description: '' },
  { dirKey: 'project.worktrees_dir', dir: 'Z:\\ws\\demo\\.forge\\worktrees', description: '' },
]

describe('dirHeadRows 显示规则（spec §2.7——键集来自目录事实服务，UI 零写死清单）', () => {
  it('隐藏 forge.home/project.tmp_dir 与插件键；显示三键有序（保 host 下发序）', () => {
    expect(dirHeadRows(ROWS)).toEqual([
      { label: '项目运行时产物根目录', value: 'C:\\dsh\\forge\\projects\\demo' },
      { label: '文档位置', value: 'Z:\\ws\\demo\\.forge\\docs' },
      { label: 'Worktree根目录', value: 'Z:\\ws\\demo\\.forge\\worktrees' },
    ])
  })

  it('行缺席 / dir null = 「—」；rows undefined = 零行', () => {
    const partial: readonly DirFactRow[] = [
      { dirKey: 'project.docs_dir', dir: null, description: '' },
      { dirKey: 'project.worktrees_dir', dir: 'Z:\\ws\\demo\\.forge\\worktrees', description: '' },
    ]
    const out = dirHeadRows(partial)
    expect(out).toHaveLength(2)
    expect(out[0]?.value).toBe('—')
    expect(out[1]?.value).toBe('Z:\\ws\\demo\\.forge\\worktrees')
    expect(dirHeadRows(undefined)).toEqual([])
  })

  it('dirFactRowLabel 单源（overview-data overviewHeadRows 消费同表）', () => {
    expect(dirFactRowLabel('project.runtime_dir')).toBe('项目运行时产物根目录')
    expect(dirFactRowLabel('project.docs_dir')).toBe('文档位置')
    expect(dirFactRowLabel('project.worktrees_dir')).toBe('Worktree根目录')
  })
})
