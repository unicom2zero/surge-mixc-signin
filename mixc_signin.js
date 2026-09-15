const STORE_KEY = "mixc_signin_credentials_v1";
const TIME_OFFSET_KEY = "mixc_signin_time_offset_v1";
const ENDPOINT = "https://app.mixcapp.com/mixc/gateway";
const SIGN_SECRET = "P@Gkbu0shTNHjhM!7F";

function add32(a, b) {
  return (a + b) & 0xffffffff;
}

function cmn(q, a, b, x, s, t) {
  return add32((add32(add32(a, q), add32(x, t)) << s) | (add32(add32(a, q), add32(x, t)) >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function md5Cycle(state, block) {
  let [a, b, c, d] = state;
  const original = [a, b, c, d];
  const rounds = [
    [ff, 0, 7, -680876936], [ff, 1, 12, -389564586], [ff, 2, 17, 606105819], [ff, 3, 22, -1044525330],
    [ff, 4, 7, -176418897], [ff, 5, 12, 1200080426], [ff, 6, 17, -1473231341], [ff, 7, 22, -45705983],
    [ff, 8, 7, 1770035416], [ff, 9, 12, -1958414417], [ff, 10, 17, -42063], [ff, 11, 22, -1990404162],
    [ff, 12, 7, 1804603682], [ff, 13, 12, -40341101], [ff, 14, 17, -1502002290], [ff, 15, 22, 1236535329],
    [gg, 1, 5, -165796510], [gg, 6, 9, -1069501632], [gg, 11, 14, 643717713], [gg, 0, 20, -373897302],
    [gg, 5, 5, -701558691], [gg, 10, 9, 38016083], [gg, 15, 14, -660478335], [gg, 4, 20, -405537848],
    [gg, 9, 5, 568446438], [gg, 14, 9, -1019803690], [gg, 3, 14, -187363961], [gg, 8, 20, 1163531501],
    [gg, 13, 5, -1444681467], [gg, 2, 9, -51403784], [gg, 7, 14, 1735328473], [gg, 12, 20, -1926607734],
    [hh, 5, 4, -378558], [hh, 8, 11, -2022574463], [hh, 11, 16, 1839030562], [hh, 14, 23, -35309556],
    [hh, 1, 4, -1530992060], [hh, 4, 11, 1272893353], [hh, 7, 16, -155497632], [hh, 10, 23, -1094730640],
    [hh, 13, 4, 681279174], [hh, 0, 11, -358537222], [hh, 3, 16, -722521979], [hh, 6, 23, 76029189],
    [hh, 9, 4, -640364487], [hh, 12, 11, -421815835], [hh, 15, 16, 530742520], [hh, 2, 23, -995338651],
    [ii, 0, 6, -198630844], [ii, 7, 10, 1126891415], [ii, 14, 15, -1416354905], [ii, 5, 21, -57434055],
    [ii, 12, 6, 1700485571], [ii, 3, 10, -1894986606], [ii, 10, 15, -1051523], [ii, 1, 21, -2054922799],
    [ii, 8, 6, 1873313359], [ii, 15, 10, -30611744], [ii, 6, 15, -1560198380], [ii, 13, 21, 1309151649],
    [ii, 4, 6, -145523070], [ii, 11, 10, -1120210379], [ii, 2, 15, 718787259], [ii, 9, 21, -343485551],
  ];

  rounds.forEach(([fn, index, shift, constant], round) => {
    const values = [a, b, c, d];
    const next = fn(values[0], values[1], values[2], values[3], block[index], shift, constant);
    [a, b, c, d] = [d, next, b, c];
  });

  state[0] = add32(a, original[0]);
  state[1] = add32(b, original[1]);
  state[2] = add32(c, original[2]);
  state[3] = add32(d, original[3]);
}

function md5Block(text) {
  const block = [];
  for (let i = 0; i < 64; i += 4) {
    block[i >> 2] = text.charCodeAt(i) + (text.charCodeAt(i + 1) << 8) + (text.charCodeAt(i + 2) << 16) + (text.charCodeAt(i + 3) << 24);
  }
  return block;
}

function hex(value) {
  const chars = "0123456789abcdef";
  let output = "";
  for (let i = 0; i < 4; i += 1) {
    const byte = (value >>> (i * 8)) & 0xff;
    output += chars[(byte >>> 4) & 0x0f] + chars[byte & 0x0f];
  }
  return output;
}

function md5(text) {
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let index;
  for (index = 64; index <= text.length; index += 64) md5Cycle(state, md5Block(text.slice(index - 64, index)));
  const tail = new Array(16).fill(0);
  const remaining = text.slice(index - 64);
  for (let i = 0; i < remaining.length; i += 1) tail[i >> 2] |= remaining.charCodeAt(i) << ((i % 4) << 3);
  tail[remaining.length >> 2] |= 0x80 << ((remaining.length % 4) << 3);
  if (remaining.length > 55) {
    md5Cycle(state, tail);
    tail.fill(0);
  }
  tail[14] = text.length * 8;
  md5Cycle(state, tail);
  return state.map(hex).join("");
}

function base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function formEncode(object) {
  return Object.keys(object)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(object[key])}`)
    .join("&");
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  const hour = date.getHours() % 12 || 12;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(hour)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildPayload(template, action, timeOffset = 0) {
  const timestamp = Date.now() + timeOffset;
  const payload = { ...template };
  delete payload.sign;
  delete payload.action;
  delete payload.params;
  payload.action = action;
  payload.apiVersion = payload.apiVersion || "1.0";
  payload.timestamp = String(timestamp);
  payload.params = base64Url(JSON.stringify({ mallNo: payload.mallNo }));
  if (Object.prototype.hasOwnProperty.call(template, "t")) payload.t = String(timestamp);
  if (Object.prototype.hasOwnProperty.call(template, "date")) payload.date = formatDate(timestamp);

  const canonical = Object.keys(payload)
    .sort()
    .filter((key) => payload[key] !== undefined && payload[key] !== null)
    .map((key) => `${key}=${payload[key]}&`)
    .join("");
  payload.sign = md5(canonical + SIGN_SECRET);
  return payload;
}

function callGateway(credentials, action, timeOffset) {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded",
    ...credentials.headers,
  };
  const body = formEncode(buildPayload(credentials.template, action, timeOffset));

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("请求超时，请检查网络后重试"));
    }, 12000);

    $httpClient.post({ url: ENDPOINT, headers, body }, (error, response, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(new Error(typeof error === "string" ? error : JSON.stringify(error)));
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (_error) {
        reject(new Error(`服务器返回内容无法解析（HTTP ${response && response.status}）`));
      }
    });
  });
}

function notify(subtitle, body) {
  $notification.post("一点万象签到", subtitle, body);
}

function panelResult(message, style, hasCredentials = true) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const checkedAt = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return {
    title: "一点万象签到",
    content: `${message}\n凭据：${hasCredentials ? "已记录" : "未获取"}  检查：${checkedAt}`,
    style,
  };
}

async function main() {
  if (typeof $trigger !== "undefined" && $trigger === "button") {
    notify("正在检查", "正在查询今日签到状态，请稍候。");
  }

  const stored = $persistentStore.read(STORE_KEY);
  if (!stored) {
    notify("尚未获取登录凭据", "请打开一点万象的签到页一次，Surge 会自动记录凭据。");
    return panelResult("尚未获取登录凭据，请先打开签到页。", "alert", false);
  }

  const credentials = JSON.parse(stored);
  let timeOffset = Number($persistentStore.read(TIME_OFFSET_KEY) || 0);
  let status = await callGateway(credentials, "mixc.app.memberSign.signDate", timeOffset);

  if (["20108", "400"].includes(String(status.code)) && status.timestamp) {
    timeOffset = Number(status.timestamp) - Date.now();
    $persistentStore.write(String(timeOffset), TIME_OFFSET_KEY);
    status = await callGateway(credentials, "mixc.app.memberSign.signDate", timeOffset);
  }

  if (String(status.code) !== "0") {
    const message = `${status.message || "未知错误"}（${status.code || "无错误码"}）`;
    notify("签到状态查询失败", message);
    return panelResult(`状态查询失败：${message}`, "error");
  }

  if (status.data && status.data.canSign) {
    console.log("一点万象今日已签到，无需重复执行。");
    return panelResult("今日已签到，无需重复执行。", "good");
  }

  const result = await callGateway(credentials, "mixc.app.memberSign.sign", timeOffset);
  if (String(result.code) === "0") {
    const points = status.data && status.data.todayPoint;
    const message = points ? `获得 ${points} 万象星` : "今日签到已完成";
    notify("签到成功", message);
    return panelResult(`签到成功：${message}`, "good");
  } else {
    const message = `${result.message || "未知错误"}（${result.code || "无错误码"}）`;
    notify("签到失败", message);
    return panelResult(`签到失败：${message}`, "error");
  }
}

main()
  .then((result) => $done(result))
  .catch((error) => {
    const message = error.message || String(error);
    notify("脚本运行异常", message);
    $done(panelResult(`脚本运行异常：${message}`, "error"));
  });
