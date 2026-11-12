// 基本信息区（用户裁定 2026-11-13）：forge 相关目录行共五行，数据源 = plugins/project
// host/dirs 锚注册表（DIR_KEY_REGISTRY 单源）经 host 侧解析后 forgeDirs Typert namespace
// 下发；UI 面只渲染、禁自行拼接目录路径。forge.tmp 与 forge.project_home 不列示（host
// 半永不越过本键集下发）。装载拆独立路（不经 channels 头路——Typert 为官方宿主唯一通路），
// fail-soft：face 缺席/单键解析失败 = 该行「—」，不阻断 ov-head 其余内容。
import { useEffect, useRef, useState } from 'react'
import type { DirFactRow } from '@dsh-forge/contracts'
import { createForgeRpcClient } from '../../rpc.js'

/** 列示键集（有序——与 host 半 DIR_FACTS_PRESENTED_KEYS + 项目行两键成对；测试 pin 锁定） */
export const DIR_FACTS_ROW_KEYS = ['workspaceRoot', 'forgeDir', 'forge.docs_root', 'forge.task_home', 'forge.worktrees'] as const

export type DirFactRowKey = (typeof DIR_FACTS_ROW_KEYS)[number]

/** 行标签（zh——ov-head 展开路径详情呈现面） */
const DIR_FACTS_ROW_LABELS: Record<DirFactRowKey, string> = {
  workspaceRoot: '工作区根',
  forgeDir: '.forge 目录',
  'forge.docs_root': '文档位置',
  'forge.task_home': '任务清单',
  'forge.worktrees': '派发工作树区',
}

/** 行标签取法（overview-data overviewHeadRows 消费——标签单源） */
export function dirFactRowLabel(dirKey: DirFactRowKey): string {
  return DIR_FACTS_ROW_LABELS[dirKey]
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
 * 五行目录事实（纯函数）：dirRows 键查找投影 → {label, value}；行缺席/解析失败
 * （dir null）= 「—」。值恒为 host 下发原样字符串——本函数零路径拼接。
 */
export function dirHeadRows(rows: readonly DirFactRow[] | undefined): readonly { readonly label: string; readonly value: string }[] {
  return DIR_FACTS_ROW_KEYS.map((dirKey) => ({
    label: dirFactRowLabel(dirKey),
    value: rows?.find((row) => row.dirKey === dirKey)?.dir ?? '—',
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
