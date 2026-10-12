// 只读探针：打印一点万象凭据的结构性信息（字段名/键名/时间/错误码），
// 绝不打印任何凭据值。用于通过 surge-cli 远程确认手机上的脚本状态。
//
//   printf '%s\n' "$SURGE_PASSWORD" | "$SURGE_CLI" --remote "$PHONE" --password-stdin \
//     script evaluate tools/mixc-probe.js generic 20 webview

const CRED = "mixc_signin_credentials_v1";
const OFFSET = "mixc_signin_time_offset_v1";
const LAST = "mixc_signin_last_result_v1";

const out = [];
const raw = $persistentStore.read(CRED);

if (!raw) {
  out.push("credentials: EMPTY");
} else {
  try {
    const d = JSON.parse(raw);
    out.push("templateVersion=" + d.templateVersion);
    out.push("sourceAction=" + (d.sourceAction || "-"));
    out.push("capturedAt=" + (d.capturedAt ? new Date(d.capturedAt).toISOString() : "-"));
    out.push("templateCapturedAt=" + (d.templateCapturedAt ? new Date(d.templateCapturedAt).toISOString() : "-"));
    out.push("templateFields=" + Object.keys(d.template || {}).join(","));
    out.push("headerNames=" + Object.keys(d.headers || {}).join(","));
  } catch (e) {
    out.push("credentials: PARSE_ERROR " + e.message);
  }
}

out.push("timeOffset=" + ($persistentStore.read(OFFSET) || "0"));

const last = $persistentStore.read(LAST);
out.push("lastResult=" + (last ? last.replace(/\s+/g, " ").slice(0, 200) : "none"));

const text = out.join("\n");
console.log(text);
$done({ content: text });
