# 酷狗概念版 · 天天签到领畅听VIP（自动）

每天自动领 1 天畅听 VIP。GitHub Actions 定时跑，不需要电脑开机。

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

**Actions → 酷狗概念版 天天签到领VIP → Run workflow**。日志会打印今天签没签。

## 接口备忘

```
状态 GET  https://gateway.kugou.com/youth/v1/activity/get_listen_song_task?source_id=90137
领取 POST https://gateway.kugou.com/youth/v1/recharge/receive_vip_listen_song
          ?receive_day=YYYY-MM-DD&source_id=90137   body: {}
```

- 签名：`md5(salt + 按 key 排序的 k=v 拼接 + body + salt)`，iOS 盐 `ovEFNp9SKfiU4IhZHPxpro0nnp0jLiUb`
- `task_status=3` 已领取；重复领取返回 `131001`
- `304003` 日期不能小于今天；`20006` 签名盐失效

## 常见问题

- **token 过期**（约 2 个月）：重新抓包换 `KUGOU_TOKEN`
- **定时不准**：GitHub 的 cron 高峰会延迟几分钟到十几分钟，属正常
- **60 天后不再运行**：`keepalive.yml` 每月空提交一次，防止被停用
- 如果某天日志是 `131001` 但你确认没领过，说明接口要求先有听歌记录，需要再补一步播放上报

## 免责

仅供自用学习。非官方接口，可能随客户端版本变动而失效；自动化调用存在触发风控的可能，请自行权衡。
