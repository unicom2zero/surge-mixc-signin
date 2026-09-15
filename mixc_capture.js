const STORE_KEY = "mixc_signin_credentials_v1";
const VOLATILE_FIELDS = new Set(["action", "params", "sign", "timestamp", "date", "t"]);

function parseForm(body) {
  const result = {};
  for (const item of String(body || "").split("&")) {
    if (!item) continue;
    const index = item.indexOf("=");
    const key = index < 0 ? item : item.slice(0, index);
    const value = index < 0 ? "" : item.slice(index + 1);
    result[decodeURIComponent(key.replace(/\+/g, " "))] = decodeURIComponent(
      value.replace(/\+/g, " "),
    );
  }
  return result;
}

function mergeHeaders(previousHeaders, requestHeaders) {
  const headers = { ...(previousHeaders || {}) };
  const standardNames = {
    cookie: "Cookie",
    "user-agent": "User-Agent",
    referer: "Referer",
    authorization: "Authorization",
    "x-mixc-swimlane": "X-Mixc-Swimlane",
  };

  for (const [name, value] of Object.entries(requestHeaders || {})) {
    const lowerName = name.toLowerCase();
    const looksLikeCredential = /(token|auth|session)/i.test(name);
    if (value && (standardNames[lowerName] || looksLikeCredential)) {
      const existingName = Object.keys(headers).find(
        (key) => key.toLowerCase() === lowerName,
      );
      if (existingName) delete headers[existingName];
      headers[standardNames[lowerName] || name] = value;
    }
  }
  return headers;
}

try {
  const form = parseForm($request.body);
  let previous = {};
  try {
    previous = JSON.parse($persistentStore.read(STORE_KEY) || "{}");
  } catch (_error) {
    previous = {};
  }

  const incomingTemplate = {};
  const previousTemplate = previous.template || {};
  const isGatewayRequest = /\/mixc\/gateway(?:\?|$)/.test($request.url || "");
  for (const [key, value] of Object.entries(form)) {
    const isKnownField = Object.prototype.hasOwnProperty.call(previousTemplate, key);
    const looksLikeCredential = /(token|auth|session|device|appId|platform)/i.test(key);
    if (
      !VOLATILE_FIELDS.has(key)
      && value !== ""
      && (isGatewayRequest || isKnownField || looksLikeCredential)
    ) {
      incomingTemplate[key] = value;
    }
  }

  const template = { ...previousTemplate, ...incomingTemplate };
  const setupRequired = ["appId", "mallNo", "token", "platform", "deviceParams"];

  if (!setupRequired.every((key) => template[key])) {
    console.log("一点万象签到参数尚未初始化，请先进入一次签到页面。");
  } else {
    const headers = mergeHeaders(previous.headers, $request.headers);
    const changedFields = Object.keys(incomingTemplate).filter(
      (key) => previousTemplate[key] !== incomingTemplate[key],
    );

    $persistentStore.write(
      JSON.stringify({
        template,
        headers,
        capturedAt: Date.now(),
        sourceAction: form.action || "unknown",
      }),
      STORE_KEY,
    );
    console.log(
      `一点万象凭据已刷新，来源动作：${form.action || "unknown"}，更新字段：${changedFields.join(",") || "headers/时间"}`,
    );
  }
} catch (error) {
  console.log(`一点万象凭据刷新失败：${error.message}`);
}

$done({});
