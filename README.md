# CS 武器箱跨平台差价分析

实时聚合 **Steam / 网易 BUFF / IGXE** 三个平台的 CS2 武器箱价格，计算跨平台差价收益率，帮助发现搬砖套利机会。暗色单页仪表盘，开箱即用。

[![CI](https://github.com/Caibospoem/cs-case-arbitrage/actions/workflows/ci.yml/badge.svg)](./actions/workflows/ci.yml)

## 功能

- **实时价格看板**：29 个 CS2 武器箱的三平台价格与最佳差价方向，5 分钟自动刷新
- **差价收益比率排行**：按方向（BUFF→Steam / IGXE→Steam / IGXE→BUFF）排序的收益率条形图
- **价格散点图**：参考价 vs 最佳收益率，快速定位高价高收益的箱子
- **历史走势（官方成交数据）**：抓取 Steam 市场列表页内嵌的官方成交历史（中位成交价 + 销量，约一年，免登录），支持 30/90/365 天范围切换；实时观测数据仅用于看板展示，不再落盘记录
- **多级数据源回退**：单源被墙或限流时自动切换，保证可用性
- **BUFF 官方数据源**（可选）：配置 Cookie 后接入官方接口，未配置时由 SteamDT 补位

## 数据源架构

```
IGXE（SSR 页面解析）──┐
SteamDT（四平台聚合）──┼──> 聚合器（交叉校验/回退）──> SQLite 快照 ──> 仪表盘
BUFF 官方（Cookie 可选）┘
```

| 数据源 | 方式 | 备注 |
|---|---|---|
| IGXE | 服务端解析 SSR 数据 | 国内直连 |
| SteamDT | 第三方聚合 API（含 Steam 参考价） | 国内直连；**注意其 Steam 价为上游低频采样（延迟可达数小时）** |
| Steam 直连/镜像 | Steam 市场低页解析，TTL 10 分钟 | 在设置中配置镜像后**自动升级为优先源**（实时数据），SteamDT 降级为回退 |
| BUFF | 官方 API + Cookie | 可选，Cookie 仅本地加密存储 |

## 快速开始

前置要求：**Node.js ≥ 20.9**

```bash
git clone https://github.com/Caibospoem/cs-case-arbitrage.git
cd cs-case-arbitrage
npm install

# 初始化数据库（Prisma + SQLite）
mkdir db
npx prisma db push

# 启动开发服务器
npx next dev -p 3000
```

打开 http://localhost:3000 即可。

<details>
<summary>Windows PowerShell 用户</summary>

```powershell
git clone https://github.com/Caibospoem/cs-case-arbitrage.git
cd cs-case-arbitrage
npm install
mkdir db -Force
npx prisma db push
npx next dev -p 3000
```

> 注意：Windows 下请用 `npx next dev` 直接启动，不要用 `npm run dev`（其脚本使用了 `tee` 等 Unix 命令）。
</details>

## 生产部署

```bash
npm run build
npm start          # 使用 .next/standalone 产物启动（Linux/macOS 或容器内）
```

CI 会在每次 push 到 `main` 时完成 lint + 构建，并上传 standalone 产物（Actions 页面可下载）。

## BUFF Cookie 配置（可选）

登录 buff.163.com 后，从浏览器 Cookie 中复制 `session` 字段，在仪表盘「设置」对话框中填入并保存。Cookie 仅存储在本地 SQLite（加密），用于接入 BUFF 官方价格接口；不配置时 BUFF 价格由 SteamDT 聚合源提供。

## API

| 端点 | 说明 |
|---|---|
| `GET /api/prices` | 全部武器箱最新价格与收益率 |
| `GET /api/trend` | Steam 官方成交历史走势（`?hashName=`，1 小时缓存） |
| `GET /api/history` | 本地历史快照（已停止新增记录，仅保留旧数据） |
| `GET/POST /api/settings` | 采集与 Cookie 配置 |

## 风险提示 ⚠️

- **手续费**：BUFF / IGXE 出售需支付平台手续费（以平台实际费率为准），Steam 市场出售所得为**余额**且不可提现，实际到手请自行扣除成本
- **汇率差**：Steam 余额充值存在溢价，折算现金成本后收益率会显著低于表面数字
- **冷却期**：Steam 市场购买的饰品存在交易冷却期，期间无法转卖
- **价格波动**：快照间隔 5 分钟，实际成交价可能与显示价存在偏差；大额搬砖请关注流动性

本项目仅供学习与数据参考，不构成投资建议。

## License

[MIT](./LICENSE)
