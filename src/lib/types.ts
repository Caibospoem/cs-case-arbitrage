export type SourceName = 'steam' | 'buff' | 'igxe' | 'steamdt' | 'steamstore' | 'itad'

export type SourceState = 'ok' | 'degraded' | 'error' | 'unconfigured'

export interface SourceStatus {
  name: SourceName
  state: SourceState
  message?: string
  lastSuccess?: number | null
  itemCount?: number
}

export type SteamPriceSource = 'direct' | 'mirror' | 'proxy' | 'steamdt' | 'buff-reference' | 'igxe-reference' | null

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
  /** IGXE 记录的 Steam 参考价 */
  igxeSteamRef: number | null
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
  /** Steam 价优先直连（hosts 加速/Watt Toolkit 场景）。开启后 SteamDT 降级为回退源 */
  preferDirect: boolean
  /** IsThereAnyDeal API Key（可选，用于游戏史低价） */
  itadKey: string
}

/** ITAD 记录的历史最低价（region=CN，人民币） */
export interface DiscountLow {
  /** 史低价（元） */
  price: number
  /** 史低时的折扣百分比（0-100） */
  cut: number
  /** 史低出现时间（epoch ms） */
  at: number
  /** 达成史低的商店名 */
  shop: string
}

/** Steam 商店当前折扣游戏 */
export interface DiscountItem {
  appid: number
  name: string
  /** 折扣百分比（0-100） */
  discountPct: number
  /** 现价（元） */
  price: number
  /** 原价（元） */
  originalPrice: number
  /** 好评率（0-100，无评测为 null） */
  reviewScore: number | null
  /** 评测总数 */
  reviewCount: number
  /** 评测标签（好评如潮 等） */
  reviewLabel: string | null
  /** 发布日期文本（如「2026 年 10 月 28 日」） */
  releaseDate: string | null
  /** 发布日期时间戳（解析失败为 null） */
  releaseTs: number | null
  /** 封面图 URL */
  capsule: string | null
  /** ITAD 史低（未配置 Key 或无数据为 null） */
  low: DiscountLow | null
}

export interface DiscountsResponse {
  updatedAt: number
  items: DiscountItem[]
  /** Steam 当前折扣游戏总数（搜索接口 total_count） */
  totalAvailable: number | null
  /** 实际抓取规模（按评测数取前 N） */
  fetchedCount: number
  statuses: SourceStatus[]
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
