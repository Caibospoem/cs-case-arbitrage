export type SourceName = 'steam' | 'buff' | 'igxe' | 'steamdt'

export type SourceState = 'ok' | 'degraded' | 'error' | 'unconfigured'

export interface SourceStatus {
  name: SourceName
  state: SourceState
  message?: string
  lastSuccess?: number | null
  itemCount?: number
}

export type SteamPriceSource = 'direct' | 'mirror' | 'proxy' | 'steamdt' | 'buff-reference' | null

export interface CasePrice {
  /** Steam market_hash_name（英文，跨平台主键） */
  hashName: string
  nameCn: string
  nameEn: string
  igxeId?: number
  /** 各平台最低挂刀价（元） */
  steam: number | null
  steamMedian: number | null
  steamVia: SteamPriceSource
  /** Steam 价格的原始采样时刻（epoch ms）。SteamDT 来源为上游低频采样时间（延迟可达数小时），直连为抓取时刻，BUFF 参考为抓取时刻 */
  steamUpdatedAt: number | null
  buff: number | null
  /** BUFF 求购（收刀）最高价 */
  buffBuyOrder: number | null
  /** BUFF 数据来源：官方接口 / SteamDT 聚合 */
  buffVia: 'official' | 'steamdt' | null
  /** BUFF 记录的 Steam 参考价 */
  buffSteamRef: number | null
  igxe: number | null
  igxeBuyOrder: number | null
  /** 收益率（小数，如 0.12 表示 +12%） */
  buffToSteam: number | null
  igxeToSteam: number | null
  steamToBuff: number | null
  steamToIgxe: number | null
  igxeToBuff: number | null
  buffToIgxe: number | null
  /** IGXE 内部差价：挂刀价买入 → 求购价卖出（扣手续费） */
  igxeSpread: number | null
  /** 最高收益率与对应方向（便于排序/图表） */
  bestRatio: number | null
  bestDirection: string | null
}

export type RatioDirection =
  | 'buffToSteam'
  | 'igxeToSteam'
  | 'steamToBuff'
  | 'steamToIgxe'
  | 'igxeToBuff'
  | 'buffToIgxe'
  | 'igxeSpread'

export interface Fees {
  steam: number
  buff: number
  igxe: number
}

export interface PricesResponse {
  updatedAt: number
  fees: Fees
  cases: CasePrice[]
  statuses: SourceStatus[]
  steamThrottled?: boolean
}

export interface AppSettings {
  steamFeePct: number
  buffFeePct: number
  igxeFeePct: number
  buffCookie: string
  steamMirrors: string
}

export interface HistoryPoint {
  t: number
  steamPrice: number | null
  buffPrice: number | null
  igxePrice: number | null
  buffToSteam: number | null
  igxeToSteam: number | null
  igxeToBuff: number | null
}
