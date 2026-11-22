#!/usr/bin/env node
/**
 * 酷狗概念版 每日签到（金币）
 *
 *   node sign.js            签到（今天已签则跳过）
 *   node sign.js --check    只查状态，不签
 *
 * 接口: POST https://gateway.kugou.com/yutc/youth/v1/task/signon
 * 签名: md5(salt + 按 key 排序的 k=v 拼接 + body + salt)
 *
 * 本地: node sign.js [--check]   凭证读 config.json
 * CI  : 凭证读环境变量 KUGOU_TOKEN / KUGOU_USERID / KUGOU_DFID / KUGOU_MID
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const LOG = path.join(HERE, "sign.log");

/**
 * 金币接口必须走 /yutc 前缀：实测 2026-11，
 *   /yutc/youth/v1/task/sign_state -> 200
 *   /youth/v1/task/sign_state      -> 400 Bad Request
 * 所以这里写死前缀，不跟随 config.json 的 base（VIP 脚本用的是裸域名）。
 */
const API_BASE = "https://gateway.kugou.com/yutc";

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
    };
  }
  return JSON.parse(fs.readFileSync(path.join(HERE, "config.json"), "utf8"));
}

const CFG = loadConfig();

const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");

/** 北京时间 YYYYMMDD */
function bjCode() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
}

function baseParams() {
  return {
    appid: CFG.appid,
    clientver: CFG.clientver,
    clienttime: Math.floor(Date.now() / 1000),
    mid: CFG.mid,
    uuid: CFG.mid,
    dfid: CFG.dfid,
    kugouid: CFG.userid,
    userid: CFG.userid,
    clienttoken: CFG.token,
    token: CFG.token,
    platform: "ios",
    from: "client",
    source: 1,
  };
}

async function call(method, urlPath, bodyObj) {
  const p = baseParams();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 300) };
  }
  return json;
}

const todayEntry = (json) =>
  (json?.data?.list || []).find((x) => x.code === bjCode()) || null;

async function main() {
  const checkOnly = process.argv.includes("--check");
  const code = bjCode();

  let state = await call("GET", "/youth/v1/task/sign_state");
  if (state?.errcode !== 0 && state?.errcode !== undefined) {
    log(`查询状态失败: ${JSON.stringify(state).slice(0, 200)}`);
    if (state?._raw && /<html/i.test(state._raw)) log(`网关返回 HTML（通常是路径前缀不对），当前 base=${API_BASE}`);
    if (state?.errcode === 20006) log("签名盐可能已变更");
    process.exit(2);
  }

  let entry = todayEntry(state);
  if (!entry) {
    log(`状态里找不到 ${code}，接口可能改版`);
    process.exit(2);
  }

  if (entry.state === 1) {
    log(`${code} 今日已签到（${entry.award_coins} 金币），跳过`);
    process.exit(0);
  }
  if (checkOnly) {
    log(`${code} 未签到，可签（奖励 ${entry.award_coins} 金币）`);
    process.exit(0);
  }

  const r = await call("POST", "/youth/v1/task/signon", { code });
  if (r?.errcode === 0) {
    const e = todayEntry(r) || {};
    log(`✅ ${code} 签到成功，奖励 ${e.award_coins ?? entry.award_coins} 金币`);
    process.exit(0);
  }
  if (r?.errcode === 30014) {
    log(`${code} 奖励已被领取（可能已在 App 内签过）`);
    process.exit(0);
  }
  log(`❌ 签到失败: errcode=${r?.errcode} ${r?.error || ""}`);
  if (r?.errcode === 20006) log("提示: 签名盐失效，需重新抓包");
  if (r?.errcode === 20018 || r?.errcode === 51002) log("提示: token 过期，需重新登录抓包");
  process.exit(1);
}

main().catch((e) => {
  log(`异常: ${e.message}`);
  process.exit(1);
});
