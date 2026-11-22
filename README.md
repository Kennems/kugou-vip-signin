# 酷狗概念版 · 每日签到（畅听VIP + 金币，自动）

每天自动领 1 天畅听 VIP，并领取每日签到金币（150 起，连签递增）。GitHub Actions 定时跑，不需要电脑开机。

- **定时**：每天 **凌晨 05:00 北京时间**（前一天 21:00 UTC）
- **两个脚本**：`vip.js` 领畅听 VIP，`sign.js` 领金币，均幂等，重复执行不会重复领
- 互不牵连：VIP 那步失败，金币那步照样执行（`if: always()`）

## 一次性配置

### 1. 填 Secrets

仓库 **Settings → Secrets and variables → Actions → New repository secret**，加这四个：

| 名称 | 含义 | 从哪来 |
| --- | --- | --- |
| `KUGOU_TOKEN` | 登录 token | 抓包，见下 |
| `KUGOU_USERID` | 用户 ID（纯数字） | 同上 |
| `KUGOU_DFID` | 设备 dfid | 同上 |
| `KUGOU_MID` | 设备 mid（32 位 md5） | 同上 |

### 2. 抓一次凭证（约 5 分钟）

1. 装 mitmproxy：`uv tool install mitmproxy`
2. 启动：`~/.local/bin/mitmdump -p 8888 -s capture.py -q`
3. 信任证书：`security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db ~/.mitmproxy/mitmproxy-ca-cert.pem`
4. 系统设置里把 **HTTP/HTTPS 代理** 指到 `127.0.0.1:8888`，并把 **SOCKS 代理关掉**（否则 App 走 SOCKS，抓不到）
5. 打开酷狗概念版，随便点几下
6. `captures.jsonl` 里搜 `user/v1/init`，URL 里就有 `token` / `userid` / `dfid` / `mid`
7. 抓完把代理关回去，并删除证书：`security remove-trusted-cert ~/.mitmproxy/mitmproxy-ca-cert.pem`

## 手动触发

**Actions → 酷狗概念版 每日签到（畅听VIP + 金币）→ Run workflow**。日志会分别打印今天 VIP 和金币的领取情况。

## 接口备忘

```
【畅听VIP】走裸域名（带 /yutc 会 404）
状态 GET  https://gateway.kugou.com/youth/v1/activity/get_listen_song_task?source_id=90137
领取 POST https://gateway.kugou.com/youth/v1/recharge/receive_vip_listen_song
          ?receive_day=YYYY-MM-DD&source_id=90137   body: {}

【金币】走 /yutc 前缀（不带会 400）
状态 GET  https://gateway.kugou.com/yutc/youth/v1/task/sign_state
领取 POST https://gateway.kugou.com/yutc/youth/v1/task/signon   body: {"code":"YYYYMMDD"}
```

> ⚠️ 两套接口的网关前缀相反，所以脚本里各自写死了 base（`vip.js` = 裸域名，`sign.js` = 带 `/yutc`），
> **不要**再共用 `config.json` 的 `base` 字段，否则必有一边挂掉。

- 签名：`md5(salt + 按 key 排序的 k=v 拼接 + body + salt)`，iOS 盐 `ovEFNp9SKfiU4IhZHPxpro0nnp0jLiUb`
- VIP：`task_status=3` 已领取；重复领取返回 `131001`；`304003` 日期不能小于今天；`20006` 签名盐失效
- 金币：`state=1` 已签到；重复签到返回 `30014`

## 常见问题

- **token 过期**（约 2 个月）：重新抓包换 `KUGOU_TOKEN`
- **定时不准**：GitHub 的 cron 用 UTC，且高峰（尤其整点）会延迟几分钟到几十分钟，属正常；错过当天不会补跑
- **60 天后不再运行**：`keepalive.yml` 每月空提交一次，防止被停用
- 如果某天日志是 `131001` 但你确认没领过，说明接口要求先有听歌记录，需要再补一步播放上报

## 免责

仅供自用学习。非官方接口，可能随客户端版本变动而失效；自动化调用存在触发风控的可能，请自行权衡。
