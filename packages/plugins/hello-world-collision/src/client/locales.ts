/**
 * The collision-replica dictionary: one namespace, two built-in locales, every
 * key present in both (the typed locale registration enforces bilingual
 * balance). Copy text explicitly names the fixture so the live UI observation
 * can tell the replica panel and the hello-world panel apart.
 */

/** Dictionary key union of the collision namespace (LocaleNamespaceMap merge target). */
export type CollisionKey =
  | 'greet'
  | 'increment'
  | 'counter'
  | 'panelDefault'

/** English copy. */
export const en: Record<CollisionKey, string> = {
  greet: 'Collision replica — a second panel from the hello-world-collision fixture',
  increment: 'Replica hello',
  counter: 'Replica hellos: {count}',
  panelDefault: 'Replica sub-slot default content',
}

/** Chinese copy. */
export const zh: Record<CollisionKey, string> = {
  greet: '撞键复制品 — 来自 hello-world-collision fixture 的第二块面板',
  increment: '复制品招呼',
  counter: '复制品招呼数：{count}',
  panelDefault: '复制品子槽位默认内容',
}
