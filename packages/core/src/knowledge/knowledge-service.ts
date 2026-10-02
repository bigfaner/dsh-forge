// 知识域服务收口（3.3：Interface 2 全七法装配面；3.5：+ browse 聚合法）。定位：装配（业务内）。
// 分文件组并齐：index-service（rebuildIndex）+ recall-service（search/readAbstract/heatByEntry）
// + browse-service（listEntries/getEntryDetail/sessionRecall/browse）→ 单一服务交
// service.ts 注册 ctx.forgeKnowledge。索引重建缝共享同一实例（静默重建联动不重复建服务）。
// browse = Interface 2 之外的第八法（forge:knowledge/browse 通道 handler 挂接，host 侧
// structural 消费）；search/readAbstract 仍仅经插件 tool 面（双门分工）。
import type Database from 'better-sqlite3'
import type { KnowledgeService } from '@dsh-forge/contracts'
import { createKnowledgeIndexService } from './index-service.js'
import { createKnowledgeRecallService } from './recall-service.js'
import { createKnowledgeBrowseService, type KnowledgeBrowseFace } from './browse-service.js'

export interface KnowledgeServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；三服务面共享单句柄单写路径） */
  db: Database.Database
}

/** Interface 2：core · 知识域完整服务面（ctx.forgeKnowledge）；3.5 增列 browse 聚合法 */
export function createKnowledgeService(deps: KnowledgeServiceDeps): KnowledgeService & KnowledgeBrowseFace {
  const indexService = createKnowledgeIndexService({ db: deps.db })
  const recallService = createKnowledgeRecallService({ db: deps.db, indexService })
  const browseService = createKnowledgeBrowseService({ db: deps.db, indexService })
  return {
    rebuildIndex: indexService.rebuildIndex,
    search: recallService.search,
    readAbstract: recallService.readAbstract,
    listEntries: browseService.listEntries,
    getEntryDetail: browseService.getEntryDetail,
    heatByEntry: recallService.heatByEntry,
    sessionRecall: browseService.sessionRecall,
    browse: browseService.browse, // 3.5 RPC browse 通道挂接（域树聚合面）
  }
}
