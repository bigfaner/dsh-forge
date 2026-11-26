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
  { dirKey: 'forge.db', dir: 'C:\\dsh\\forge\\db', description: '' },
  { dirKey: 'forge.tmp', dir: 'C:\\dsh\\forge\\tmp', description: '' },
  { dirKey: 'knowledge.store', dir: 'C:\\dsh\\forge\\knowledge', description: '' },
  { dirKey: 'forge.project_runtime_dir', dir: 'C:\\dsh\\forge\\projects\\demo', description: '' },
  { dirKey: 'forge.task_runtime_dir', dir: 'D:\\tasks\\demo@abcd1234', description: '' },
  { dirKey: 'forge.docs_root', dir: 'Z:\\ws\\demo\\.forge\\docs', description: '' },
  { dirKey: 'forge.worktrees', dir: 'Z:\\ws\\demo\\.forge\\worktrees', description: '' },
]

describe('dirHeadRows 显示规则（spec §2.7——键集来自目录事实服务，UI 零写死清单）', () => {
  it('隐藏 forge.home/forge.db/forge.tmp 与插件键；显示四键有序（保 host 下发序）', () => {
    expect(dirHeadRows(ROWS)).toEqual([
      { label: '项目运行时产物根目录', value: 'C:\\dsh\\forge\\projects\\demo' },
      { label: '任务运行时产物目录', value: 'D:\\tasks\\demo@abcd1234' },
      { label: '文档位置', value: 'Z:\\ws\\demo\\.forge\\docs' },
      { label: 'Worktree根目录', value: 'Z:\\ws\\demo\\.forge\\worktrees' },
    ])
  })

  it('行缺席 / dir null = 「—」；rows undefined = 零行', () => {
    const partial: readonly DirFactRow[] = [
      { dirKey: 'forge.docs_root', dir: null, description: '' },
      { dirKey: 'forge.task_runtime_dir', dir: 'D:\\tasks\\demo@abcd1234', description: '' },
    ]
    const out = dirHeadRows(partial)
    expect(out).toHaveLength(2)
    expect(out[0]?.value).toBe('—')
    expect(out[1]?.value).toBe('D:\\tasks\\demo@abcd1234')
    expect(dirHeadRows(undefined)).toEqual([])
  })

  it('dirFactRowLabel 单源（overview-data overviewHeadRows 消费同表）', () => {
    expect(dirFactRowLabel('forge.project_runtime_dir')).toBe('项目运行时产物根目录')
    expect(dirFactRowLabel('forge.task_runtime_dir')).toBe('任务运行时产物目录')
    expect(dirFactRowLabel('forge.docs_root')).toBe('文档位置')
    expect(dirFactRowLabel('forge.worktrees')).toBe('Worktree根目录')
  })
})
