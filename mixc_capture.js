const STORE_KEY = "mixc_signin_credentials_v1";

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

try {
  const form = parseForm($request.body);
  const required = ["appId", "mallNo", "token", "platform", "deviceParams"];

  if (required.every((key) => form[key])) {
    const template = { ...form };
    for (const key of ["action", "params", "sign", "timestamp", "date", "t"]) {
      delete template[key];
    }

    const requestHeaders = $request.headers || {};
    const headers = {};
    for (const name of ["Cookie", "User-Agent", "Referer", "X-Mixc-Swimlane"]) {
      const actual = Object.keys(requestHeaders).find(
        (key) => key.toLowerCase() === name.toLowerCase(),
      );
      if (actual && requestHeaders[actual]) headers[name] = requestHeaders[actual];
    }

    $persistentStore.write(
      JSON.stringify({ template, headers, capturedAt: Date.now() }),
      STORE_KEY,
    );
    console.log(`一点万象凭据已刷新，来源动作：${form.action || "unknown"}`);
  }
} catch (error) {
  console.log(`一点万象凭据刷新失败：${error.message}`);
}

$done({});
