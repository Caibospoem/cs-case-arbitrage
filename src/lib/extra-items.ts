/**
 * 附加跟踪物品：不在 CS2 武器箱关键词覆盖范围内、需要单独抓取的物品。
 * 典型例子：TF2 的曼恩公司供应箱钥匙（市场硬通货）。
 *
 * 注意：
 *  - appid 用于 Steam priceoverview / listing 页（CS2=730，TF2=440）
 *  - igxeGame 用于 IGXE 市场路径段（csgo / tf2）
 *  - SteamDT 排行榜仅覆盖 CS2，这些物品无 BUFF 补位数据
 */

export interface ExtraItem {
  hashName: string
  nameCn: string
  /** Steam appid（730=CS2，440=TF2） */
  appid: number
  /** IGXE 市场路径段 */
  igxeGame: string
  note: string
}

export const EXTRA_ITEMS: ExtraItem[] = [
  {
    hashName: 'Mann Co. Supply Crate Key',
    nameCn: '曼恩公司供应箱钥匙',
    appid: 440,
    igxeGame: 'tf2',
    note: 'TF2 交易硬通货',
  },
]

const byHash = new Map(EXTRA_ITEMS.map((i) => [i.hashName, i]))

/** 按物品名解析 Steam appid（默认 CS2） */
export function steamAppIdFor(hashName: string): number {
  return byHash.get(hashName)?.appid ?? 730
}

/** 按物品名解析 IGXE 市场路径段（默认 csgo） */
export function igxeGameFor(hashName: string): string {
  return byHash.get(hashName)?.igxeGame ?? 'csgo'
}

export function isExtraItem(hashName: string): boolean {
  return byHash.has(hashName)
}
