# CS 武器箱跨平台差价分析 V2 — 运行指南

Steam / 网易BUFF / IGXE（+ 悠悠有品、C5 附加数据）三平台武器箱价格聚合，
自动扣除手续费计算 7 个方向的套利收益率，历史快照入库绘制趋势图。

## 数据源（开箱即用，无需任何 Key）

| 数据源 | 方式 | 说明 |
|---|---|---|
| IGXE | SSR 页面解析（`window.__NUXT__`） | 挂刀价 + 求购价，19+ 款箱子 |
| SteamDT | 官方排行 API（借鉴 AetherSwap 项目逆向结果） | 一次请求聚合 Steam/BUFF/悠悠有品/C5 四平台价格与求购价，国内直连免代理，26 款主流箱子 |
| 网易 BUFF | 官方 API + 登录 Cookie（可选） | 配置 Cookie 后升级为官方实时数据，未配置时由 SteamDT 补位 |
| Steam | SteamDT 聚合优先 → 直连/镜像回退 → BUFF 参考价 | 国内网络推荐直接用 SteamDT；部署到海外网络后可配置直连 |

**Steam 取价顺序**：SteamDT 聚合 → priceoverview 直连/镜像/代理 → BUFF 的 steam_price_cny 参考。
表格中价格旁的 `DT` 标识表示该数据来自 SteamDT 聚合源，`参考` 表示 BUFF 换算参考价。

## 本地运行

```bash
# 1. 安装依赖（任选其一）
npm install
# 或 bun install

# 2. 初始化 SQLite 数据库
npx prisma db push

# 3. 启动开发服务器
npm run dev
# 打开 http://localhost:3000

# 生产构建
npm run build && npm start
```

要求：Node.js 18.17+（或 Bun 1.x）。数据库为 SQLite，文件路径见 `prisma/schema.prisma`（默认 `db/custom.db`，首次运行自动生成）。

## 界面功能

- **状态徽章**：IGXE / STEAMDT / BUFF / STEAM 四源实时健康状态（绿=实时，黄=降级，红=异常）
- **KPI**：箱子总数、可用数据源数、当前最优机会（方向+收益率）、平均最优收益率
- **收益率排行图**：7 个方向 Tab 切换（BUFF→Steam、IGXE→Steam、IGXE 内部差价等），默认展示 BUFF→Steam
- **价格对比表**：三平台挂刀价+求购价（收刀）、全方向收益率、最佳收益方向；点击任意行联动详情
- **箱体详情**：三平台价格对比、收益率徽章、历史快照趋势图（1h/6h/24h/48h 窗口）
- **设置弹窗**：手续费率（默认 Steam 15% / BUFF 2.5% / IGXE 2.5%）、BUFF Cookie、Steam 镜像

## 重要风险提示

1. **Steam 余额不可提现**：「BUFF/IGXE 买入 → Steam 卖出」获得的是 Steam 钱包余额，
   只对本身就需要在 Steam 消费的人有意义，不能换成人民币，请勿当作纯现金流套利。
2. 收益率已扣除各平台手续费（可在设置中调整），但未计入：提现手续费、价格滑点、
   到货时间成本、Steam 市场税变化。
3. 价格每 60 秒自动刷新；SteamDT 数据更新频率约 1~5 分钟。

## 目录结构

```
src/
  app/api/prices/route.ts      # 聚合结果 API
  app/api/history/route.ts     # 历史快照 API
  app/api/settings/route.ts    # 设置读写 API
  lib/sources/igxe.ts          # IGXE SSR 解析源
  lib/sources/steamdt.ts       # SteamDT 聚合源（Steam/BUFF/悠悠/C5）
  lib/sources/buff.ts          # BUFF 官方源（需 Cookie）
  lib/sources/steam.ts         # Steam 直连/镜像/代理 + 内存缓存
  lib/aggregator.ts            # 多源合并 + 收益率计算 + 快照入库
  components/dashboard/        # 前端仪表盘（KPI/图表/表格/详情/设置）
prisma/schema.prisma           # Snapshot 表（历史快照）
```

## 致谢

SteamDT 接口方案参考开源项目 [AetherSwap](https://github.com/VexedWilosn/AetherSwap)
（全自动 Steam 余额交易工具，Python）的接口逆向成果，感谢其作者贡献。
