// 基本信息区（spec forge-dirs-unification §2.7）：目录行取自目录事实服务（forgeDirs
// Typert namespace 下发的 facts 全量行），UI 面只渲染、禁自行拼接目录路径；界面源码
// 零写死目录键清单——显示规则 = 界面层过滤：隐藏集常量（forge.home/forge.db/forge.tmp）
// + 标签表（显示键白名单，插件键不在表内自然隐藏）。装载拆独立路（不经 channels 头路
// ——Typert 为官方宿主唯一通路），fail-soft：face 缺席/单键解析失败 = 该行「—」，不
// 阻断 ov-head 其余内容。
import { useEffect, useRef, useState } from 'react'
import type { DirFactRow } from '@dsh-forge/contracts'
import { createForgeRpcClient } from '../../rpc.js'

/** 隐藏集（界面层展示规则——forge_dirs 工具照常返回这些键，界面不列示） */
const HIDDEN_DIR_KEYS: ReadonlySet<string> = new Set(['forge.home', 'forge.db', 'forge.tmp'])

/** 行标签表（显示键白名单 + 标签——表外键 = 隐藏；zh——ov-head 展开路径详情呈现面） */
const DIR_FACTS_ROW_LABELS: Record<string, string> = {
  'forge.project_runtime_dir': '项目运行时产物根目录',
  'forge.task_runtime_dir': '任务运行时产物目录',
  'forge.docs_root': '文档位置',
  'forge.worktrees': 'Worktree根目录',
}

/** 行标签取法（overview-data overviewHeadRows 消费——标签单源） */
export function dirFactRowLabel(dirKey: string): string {
  return DIR_FACTS_ROW_LABELS[dirKey] ?? dirKey
}

/** 显示判定（隐藏集 + 标签表白名单——两表都小时零写死键清单外的机制） */
function isDisplayedDirKey(dirKey: string): boolean {
  return dirKey in DIR_FACTS_ROW_LABELS && !HIDDEN_DIR_KEYS.has(dirKey)
}

/** forge:dirs facts 消费切片（测试替身同型——ForgeRpcClient['dirs'] 结构满足） */
export interface DirFactsRpcFace {
  facts(projectId: string): Promise<DirFactRow[]>
}

/** RPC client 构造器（缺省 = Typert 真身；注入 = 测试面） */
export type DirFactsClientFactory = () => DirFactsRpcFace

/** 缺省构造：官方 forgeDirs Typert remote 真身（face 缺席调用期诚实降级） */
export function preloadDirFactsClientFactory(): DirFactsRpcFace {
  return createForgeRpcClient().dirs
}

/**
 * 基本信息区目录事实行（纯函数）：facts 下发行按显示规则过滤（隐藏集 + 标签表白名单，
 * 保 host 下发序）→ {label, value}；行缺席/解析失败（dir null）= 「—」。值恒为 host
 * 下发原样字符串——本函数零路径拼接；rows undefined = 零行（键清单来自服务，无键可占位）。
 */
export function dirHeadRows(rows: readonly DirFactRow[] | undefined): readonly { readonly label: string; readonly value: string }[] {
  return (rows ?? [])
    .filter((row) => isDisplayedDirKey(row.dirKey))
    .map((row) => ({
      label: dirFactRowLabel(row.dirKey),
      value: row.dir ?? '—',
    }))
}

/**
 * 基本信息区装载 hook（独立路）：mount/projectId 变更装载；序号守卫防串台；
 * 失败 = undefined（呈现全「—」行 fail-soft，不阻断 ov-head）。
 * @param projectId - 当前项目（'' = 无锚不装载）
 * @param makeClient - forge:dirs client 构造器（缺省 Typert 真身；注入 = 测试面）
 */
export function useDirFactRows(projectId: string, makeClient: DirFactsClientFactory = preloadDirFactsClientFactory): readonly DirFactRow[] | undefined {
  const [rows, setRows] = useState<readonly DirFactRow[] | undefined>(undefined)
  const seqRef = useRef(0)
  useEffect(() => {
    if (projectId === '') {
      setRows(undefined)
      return
    }
    const seq = ++seqRef.current
    void (async () => {
      try {
        const out = await makeClient().facts(projectId)
        if (seq === seqRef.current) setRows(out)
      } catch {
        if (seq === seqRef.current) setRows(undefined)
      }
    })()
    return () => {
      seqRef.current += 1
    }
  }, [projectId, makeClient])
  return rows
}
