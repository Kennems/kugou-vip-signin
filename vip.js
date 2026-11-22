#!/usr/bin/env node
/**
 * 酷狗概念版「天天签到领畅听VIP」——每日自动领 1 天畅听 VIP
 *
 * 本地: node vip.js [--check]      凭证读 config.json
 * CI  : 凭证读环境变量 KUGOU_TOKEN / KUGOU_USERID / KUGOU_DFID / KUGOU_MID
 *
 * 状态: GET  /youth/v1/activity/get_listen_song_task   task_status=3 已领取
 * 领取: POST /youth/v1/recharge/receive_vip_listen_song  {receive_day, source_id}
 * 错误码: 131001=今日已领取  304003=日期不能小于今天  20006=签名盐失效
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;

function loadConfig() {
  if (process.env.KUGOU_TOKEN) {
    return {
      token: process.env.KUGOU_TOKEN,
      userid: Number(process.env.KUGOU_USERID),
      dfid: process.env.KUGOU_DFID,
      mid: process.env.KUGOU_MID,
      appid: Number(process.env.KUGOU_APPID || 3114),
      clientver: Number(process.env.KUGOU_CLIENTVER || 12480),
      salt: process.env.KUGOU_SALT || "ovEFNp9SKfiU4IhZHPxpro0nnp0jLiUb",
      source_id: process.env.VIP_SOURCE_ID || "90137",
      base: "https://gateway.kugou.com",
    };
  }
  return JSON.parse(fs.readFileSync(path.join(HERE, "config.json"), "utf8"));
}

const CFG = loadConfig();
const SOURCE_ID = CFG.source_id || "90137";

/**
 * 畅听VIP 接口挂在裸域名下：实测 2026-11，
 *   /youth/v1/activity/get_listen_song_task        -> 200
 *   /yutc/youth/v1/activity/get_listen_song_task   -> 404（openresty）
 * 所以这里写死裸域名，不跟随 config.json 的 base（金币脚本用的是 /yutc 前缀）。
 */
const API_BASE = "https://gateway.kugou.com";

const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");
const bjDay = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function call(method, urlPath, extra = {}, data) {
  const p = {
    appid: CFG.appid,
    clientver: CFG.clientver,
    clienttime: Math.floor(Date.now() / 1000),
    mid: CFG.mid,
    uuid: CFG.mid,
    dfid: CFG.dfid,
    clienttoken: CFG.token,
    userid: CFG.userid,
    token: CFG.token,
    ...extra,
  };
  const body = data !== undefined ? JSON.stringify(data) : "";
  const flat = Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
    .join("");
  p.signature = md5(`${CFG.salt}${flat}${body}${CFG.salt}`);

  const qs = Object.keys(p)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`)
    .join("&");
  const res = await fetch(`${API_BASE}${urlPath}?${qs}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body || undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

/** 查本月记录，核实某天是否真的到账（不信接口返回，只信记录） */
async function verify(day) {
  const rec = await call("GET", "/youth/v1/activity/get_month_vip_record", { latest_limit: 100 });
  const row = (rec?.data?.list || []).find((x) => x.day === day);
  if (!row) return null;
  return row.receive_vip === 1;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const day = bjDay();

  const st = await call("GET", "/youth/v1/activity/get_listen_song_task", { source_id: SOURCE_ID });
  if (st?.error_code !== 0) {
    log(`查询状态失败: ${JSON.stringify(st).slice(0, 200)}`);
    if (st?._raw && /<html/i.test(st._raw)) log(`网关返回 HTML（通常是路径前缀不对），当前 base=${API_BASE}`);
    if (st?.error_code === 20006) log("签名盐可能已变更，需重新抓包");
    if (st?.error_code === 20018 || st?.error_code === 51002) log("token 过期，需重新登录抓包");
    process.exit(2);
  }

  const taskStatus = st?.data?.task_status;
  if (taskStatus === 3) {
    const ok = await verify(day);
    log(`${day} 畅听VIP 今日已领取，跳过` + (ok === true ? "（记录已核实）" : ""));
    process.exit(0);
  }
  if (checkOnly) {
    log(`${day} 未领取（task_status=${taskStatus}），可签`);
    process.exit(0);
  }

  const r = await call(
    "POST",
    "/youth/v1/recharge/receive_vip_listen_song",
    { receive_day: day, source_id: SOURCE_ID },
    {}
  );

  if (r?.error_code === 0) {
    const ok = await verify(day);
    const tail = ok === true ? "（记录已核实）" : ok === false ? "（⚠️ 记录未确认，需复查）" : "";
    log(`✅ ${day} 签到成功：畅听VIP +1 天${tail}`);
    process.exit(0);
  }
  if (r?.error_code === 131001) {
    const ok = await verify(day);
    log(`${day} 返回 131001：` + (ok === true ? "今日已领取（记录已核实）" : "需先在 App 内有听歌记录"));
    process.exit(0);
  }
  if (r?.error_code === 304003) {
    log(`日期参数异常: ${r?.error_msg}`);
    process.exit(1);
  }
  log(`❌ 签到失败: error_code=${r?.error_code} ${r?.error_msg || ""}`);
  process.exit(1);
}

main().catch((e) => {
  log(`异常: ${e.message}`);
  process.exit(1);
});
