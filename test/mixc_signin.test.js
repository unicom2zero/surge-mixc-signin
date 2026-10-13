"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { loadScript, storedCredentials, formFields } = require("./surge-mock");

const STORE_KEY = "mixc_signin_credentials_v1";
const TIME_OFFSET_KEY = "mixc_signin_time_offset_v1";
const LAST_RESULT_KEY = "mixc_signin_last_result_v1";

const TEMPLATE = {
  appId: "mall-app",
  mallNo: "101",
  token: "TOKEN-A",
  platform: "ios",
  deviceParams: "DEVICE-A",
  apiVersion: "1.0",
};

function readyStore(extra = {}) {
  return { [STORE_KEY]: storedCredentials(TEMPLATE, { Cookie: "sid=abc" }), ...extra };
}

function runSignin(options) {
  return loadScript("mixc_signin.js", options);
}

function assertPanelVersion(result, lineCount) {
  assert.equal(result.title, "一点万象签到");
  assert.equal(result.content.split("\n").length, lineCount);
  assert.equal((result.content.match(/\bv\d+\b/g) || []).length, 1);
  assert.equal((result.content.match(/ · v8(?=\n|$)/g) || []).length, 1);
}

test("各检查结果保持原行数，版本只显示一次且缓存与返回值一致", async (t) => {
  const scenarios = [
    { name: "未获取凭据", store: {}, message: "尚未获取登录凭据，请先打开签到页。", style: "alert", lines: 2 },
    { name: "凭据损坏", store: { [STORE_KEY]: "{not json" }, message: "凭据数据损坏，请重新打开签到页。", style: "alert", lines: 2 },
    { name: "模板需重建", store: { [STORE_KEY]: storedCredentials(TEMPLATE).replace('"templateVersion":2', '"templateVersion":1') }, message: "模块升级后需进入一次签到页重建模板。", style: "alert", lines: 3 },
    { name: "查询失败", responses: [{ body: { code: "500", message: "系统繁忙" } }], message: "状态查询失败：系统繁忙（500）", style: "error", lines: 3 },
    { name: "已签到", responses: [{ body: { code: "0", data: { canSign: true } } }], message: "今日已签到，无需重复执行。", style: "good", lines: 3 },
    { name: "签到成功", responses: [{ body: { code: "0", data: { canSign: false, todayPoint: 9 } } }, { body: { code: "0" } }], message: "签到成功：获得 9 万象星", style: "good", lines: 3 },
    { name: "成功无积分", responses: [{ body: { code: "0", data: { canSign: false } } }, { body: { code: "0" } }], message: "签到成功：今日签到已完成", style: "good", lines: 3 },
    { name: "签到失败", responses: [{ body: { code: "0", data: { canSign: false } } }, { body: { code: "20109", message: "活动已结束" } }], message: "签到失败：活动已结束（20109）", style: "error", lines: 3 },
    { name: "运行异常", responses: [{ error: "模拟网络异常" }], message: "脚本运行异常：模拟网络异常", style: "error", lines: 3 },
    { name: "无来源字段", store: { [STORE_KEY]: JSON.stringify({ template: TEMPLATE, templateVersion: 2 }) }, responses: [{ body: { code: "0", data: { canSign: true } } }], message: "今日已签到，无需重复执行。", style: "good", lines: 2 },
  ];
  for (const scenario of scenarios) {
    for (const trigger of ["cron", "button"]) {
      await t.test(`${scenario.name} / ${trigger}`, async () => {
        const harness = runSignin({ trigger, store: scenario.store || readyStore(), responses: scenario.responses || [] });
        const result = await harness.donePromise;
        assertPanelVersion(result, scenario.lines);
        assert.equal(result.style, scenario.style);
        const lines = result.content.split("\n");
        assert.equal(lines[0], scenario.message);
        assert.match(lines[1], /^凭据：.*  检查：\d{2}-\d{2} \d{2}:\d{2}:\d{2} · v8$/);
        if (scenario.lines === 3) assert.equal(lines[2], "来源：mixc.app.user.info");
        assert.equal(harness.state.store[LAST_RESULT_KEY], JSON.stringify(result));
        assert.equal(harness.state.writes.filter(({ key }) => key === LAST_RESULT_KEY).length, 1);
      });
    }
  }
});

test("旧缓存替换版本，连续三次刷新保持字段和行数且不叠加", async (t) => {
  for (const suffix of ["", " · v7", " · v8"]) {
    for (const refreshed of [false, true]) {
      await t.test(`版本=${suffix || "无"} / 已刷新=${refreshed}`, async () => {
        const base = "今日已签到，无需重复执行。\n凭据：已记录  检查：09-15 08:30:00\n来源：mixc.app.user.info";
        let cached = { title: "一点万象签到", content: base.replace("08:30:00", `08:30:00${suffix}`) + (refreshed ? `\n面板刷新：09-15 08:31:00${suffix}` : ""), style: "good" };
        for (let refresh = 0; refresh < 3; refresh += 1) {
          const serialized = JSON.stringify(cached);
          const harness = runSignin({ trigger: "auto-interval", store: { [LAST_RESULT_KEY]: serialized } });
          const result = await harness.donePromise;
          assertPanelVersion(result, 4);
          assert.equal(result.style, "good");
          assert.equal(result.content.split("\n").slice(0, 3).join("\n"), base);
          assert.match(result.content.split("\n")[3], /^面板刷新：\d{2}-\d{2} \d{2}:\d{2}:\d{2} · v8$/);
          assert.equal((result.content.match(/面板刷新：/g) || []).length, 1);
          assert.equal(harness.state.httpCalls.length, 0);
          assert.equal(harness.state.notifications.length, 0);
          assert.equal(harness.state.writes.length, 0);
          assert.equal(harness.state.store[LAST_RESULT_KEY], serialized);
          cached = result;
        }
      });
    }
  }
});

test("无缓存或缓存无法解析时占位提示保持两行且带当前版本", async () => {
  for (const cached of [undefined, "{not json"]) {
    const harness = runSignin({ trigger: "auto-interval", store: cached ? { [LAST_RESULT_KEY]: cached } : {} });
    const result = await harness.donePromise;
    assertPanelVersion(result, 2);
    assert.equal(result.style, "info");
    assert.equal(result.content.split("\n")[0], "暂无签到结果，点击右侧刷新按钮检查。");
    assert.match(result.content.split("\n")[1], /^面板刷新：\d{2}-\d{2} \d{2}:\d{2}:\d{2} · v8$/);
    assert.equal(harness.state.httpCalls.length, 0);
    assert.equal(harness.state.notifications.length, 0);
    assert.equal(harness.state.writes.length, 0);
  }
});

test("模块所有签到脚本 URL 与唯一的 SCRIPT_VERSION 一致，捕获脚本仍为 v6", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const harness = runSignin({ trigger: "auto-interval", store: {} });
  const version = harness.evaluate("SCRIPT_VERSION");
  assert.equal(version, "8");
  const source = fs.readFileSync(path.join(__dirname, "..", "mixc_signin.js"), "utf8");
  assert.equal((source.match(/const SCRIPT_VERSION = "8";/g) || []).length, 1);
  for (const [file, expectedCount] of [["MixcSignIn.sgmodule", 2], ["MixcSignIn-Test.sgmodule", 1]]) {
    const text = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const urls = [...text.matchAll(/mixc_signin\.js\?v=(\d+)/g)];
    assert.equal((text.match(/mixc_signin\.js/g) || []).length, expectedCount);
    assert.equal(urls.length, expectedCount);
    for (const match of urls) assert.equal(match[1], version);
    const captures = [...text.matchAll(/mixc_capture\.js\?v=(\d+)/g)];
    assert.equal(captures.length, file === "MixcSignIn.sgmodule" ? 1 : 0);
    for (const match of captures) assert.equal(match[1], "6");
  }
});

test("auto-interval 只读缓存：不请求接口、不发通知、不覆盖缓存", async () => {
  const cached = { title: "一点万象签到", content: "今日已签到，无需重复执行。", style: "good" };
  const harness = runSignin({
    trigger: "auto-interval",
    store: readyStore({ [LAST_RESULT_KEY]: JSON.stringify(cached) }),
  });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 0);
  assert.equal(harness.state.notifications.length, 0);
  assert.equal(harness.state.writes.length, 0);
  assert.equal(result.style, "good");
  assert.match(result.content, /今日已签到，无需重复执行。/);
  assert.match(result.content, /^面板刷新：\d{2}-\d{2} \d{2}:\d{2}:\d{2} · v8$/m);
});

test("auto-interval 缓存已被刷新过时不会叠加多行面板刷新时间", async () => {
  const cached = {
    title: "一点万象签到",
    content: "今日已签到，无需重复执行。\n凭据：已记录  检查：09-15 08:30:00\n面板刷新：09-15 08:31:00",
    style: "good",
  };
  const harness = runSignin({
    trigger: "auto-interval",
    store: readyStore({ [LAST_RESULT_KEY]: JSON.stringify(cached) }),
  });
  const result = await harness.donePromise;

  assert.equal(result.content.match(/面板刷新：/g).length, 1);
  assert.equal(result.content.match(/检查：/g).length, 1);
});

test("auto-interval 无缓存时给出提示，不发通知", async () => {
  const harness = runSignin({ trigger: "auto-interval", store: {} });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 0);
  assert.equal(harness.state.notifications.length, 0);
  assert.match(result.content, /暂无签到结果/);
});

test("尚未获取凭据时提示打开签到页", async () => {
  const harness = runSignin({ trigger: "cron", store: {} });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 0);
  assert.equal(result.style, "alert");
  assert.match(result.content, /尚未获取登录凭据/);
  assert.match(result.content, /凭据：未获取/);
  assert.equal(harness.state.notifications.length, 1);
});

test("模板版本不是 2 时要求重新初始化", async () => {
  const legacy = JSON.parse(storedCredentials(TEMPLATE));
  legacy.templateVersion = 1;
  const harness = runSignin({ trigger: "cron", store: { [STORE_KEY]: JSON.stringify(legacy) } });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 0);
  assert.equal(result.style, "alert");
  assert.match(result.content, /需进入一次签到页重建模板/);
});

test("已签到时不重复提交签到", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [{ body: { code: "0", data: { canSign: true } } }],
  });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 1);
  assert.equal(result.style, "good");
  assert.match(result.content, /今日已签到，无需重复执行/);
  assert.equal(harness.state.notifications.length, 0);
  assert.equal(harness.state.store[LAST_RESULT_KEY], JSON.stringify(result));
});

test("cron-test 参数在已签到时仍发送通知", async () => {
  const harness = runSignin({
    trigger: "cron",
    argument: "cron-test",
    store: readyStore(),
    responses: [{ body: { code: "0", data: { canSign: true } } }],
  });
  await harness.donePromise;

  assert.equal(harness.state.notifications.length, 1);
  assert.match(harness.state.notifications[0].subtitle, /定时测试已触发/);
});

test("未签到时提交签到并按返回积分提示", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [
      { body: { code: "0", data: { canSign: false, todayPoint: 9 } } },
      { body: { code: "0" } },
    ],
  });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 2);
  const first = formFields(harness.state.httpCalls[0].body);
  const second = formFields(harness.state.httpCalls[1].body);
  assert.equal(first.action, "mixc.app.memberSign.signDate");
  assert.equal(second.action, "mixc.app.memberSign.sign");
  assert.equal(second.mallNo, "101");
  assert.equal(second.token, "TOKEN-A");
  assert.match(second.sign, /^[0-9a-f]{32}$/);
  assert.equal(result.style, "good");
  assert.match(result.content, /获得 9 万象星/);
  assert.equal(harness.state.notifications.length, 1);
});

test("状态未返回积分时提示今日签到已完成", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [
      { body: { code: "0", data: { canSign: false } } },
      { body: { code: "0" } },
    ],
  });
  const result = await harness.donePromise;

  assert.match(result.content, /今日签到已完成/);
  assert.equal(formFields(harness.state.httpCalls[1].body).apiVersion, "1.0");
});

test("签到接口返回非 0 时判定失败", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [
      { body: { code: "0", data: { canSign: false } } },
      { body: { code: "20109", message: "活动已结束" } },
    ],
  });
  const result = await harness.donePromise;

  assert.equal(result.style, "error");
  assert.match(result.content, /签到失败：活动已结束（20109）/);
  assert.match(harness.state.notifications[0].subtitle, /签到失败/);
});

test("状态查询返回 20108 时记录时间偏差并重试一次", async () => {
  const serverTimestamp = Date.now() + 5000;
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [
      { body: { code: "20108", message: "签名错误", timestamp: serverTimestamp } },
      { body: { code: "0", data: { canSign: true } } },
    ],
  });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 2);
  const offset = Number(harness.state.store[TIME_OFFSET_KEY]);
  assert.ok(Number.isFinite(offset), "时间偏差应写入存储");
  assert.ok(Math.abs(offset - 5000) < 1000, `时间偏差接近 5000ms，实际 ${offset}`);
  assert.match(result.content, /今日已签到/);
});

test("已记录的时间偏差会用于首次请求", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore({ [TIME_OFFSET_KEY]: "3000" }),
    responses: [{ body: { code: "0", data: { canSign: true } } }],
  });
  await harness.donePromise;

  const sent = Number(formFields(harness.state.httpCalls[0].body).timestamp);
  assert.ok(sent > Date.now(), "带正偏差的时间戳应大于本地当前时间");
});

test("状态查询失败时提示错误码", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [{ body: { code: "500", message: "系统繁忙" } }],
  });
  const result = await harness.donePromise;

  assert.equal(result.style, "error");
  assert.match(result.content, /状态查询失败：系统繁忙（500）/);
  assert.equal(harness.state.httpCalls.length, 1);
});

test("手动按钮触发时先发送检查中通知", async () => {
  const harness = runSignin({
    trigger: "button",
    store: readyStore(),
    responses: [{ body: { code: "0", data: { canSign: true } } }],
  });
  await harness.donePromise;

  assert.equal(harness.state.notifications.length, 1);
  assert.match(harness.state.notifications[0].subtitle, /正在检查/);
});

test("服务器返回非 JSON 时走异常兜底并写入缓存", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [{ body: "<html>502 Bad Gateway</html>", status: 502 }],
  });
  const result = await harness.donePromise;

  assert.equal(result.style, "error");
  assert.match(result.content, /脚本运行异常/);
  assert.match(harness.state.notifications[0].subtitle, /脚本运行异常/);
  assert.match(result.content, /凭据：已记录  更新：/);
  assert.equal(harness.state.store[LAST_RESULT_KEY], JSON.stringify(result));
});

test("脚本内自实现 MD5 与标准测试向量一致", () => {
  const harness = runSignin({ trigger: "auto-interval", store: {} });
  const vectors = [
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
    ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
    ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "d174ab98d277d9f5a5611c2c9f419d9f"],
    ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "57edf4a22be3c955ac49da2e2107b67a"],
  ];

  for (const [input, expected] of vectors) {
    const actual = harness.evaluate(`md5(${JSON.stringify(input)})`);
    assert.equal(actual, expected, `md5(${JSON.stringify(input)})`);
  }
});

test("签名结果与 node:crypto 交叉验证", () => {
  const harness = runSignin({ trigger: "auto-interval", store: {} });
  harness.evaluate("Date.now = () => 1700000000000;");

  const template = { ...TEMPLATE, t: "1700000000000", date: "2023-11-14 04:13:20" };
  const payload = harness.evaluate(
    `buildPayload(${JSON.stringify(template)}, "mixc.app.memberSign.signDate", 0)`,
  );
  const secret = harness.evaluate("SIGN_SECRET");

  const canonical = Object.keys(payload)
    .filter((key) => key !== "sign")
    .sort()
    .filter((key) => payload[key] !== undefined && payload[key] !== null)
    .map((key) => `${key}=${payload[key]}&`)
    .join("");
  const expected = crypto.createHash("md5").update(canonical + secret, "utf8").digest("hex");

  assert.equal(payload.sign, expected);
  assert.equal(payload.timestamp, "1700000000000");
  assert.equal(payload.t, "1700000000000");
  assert.equal(payload.action, "mixc.app.memberSign.signDate");
  assert.match(payload.date, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  const params = JSON.parse(Buffer.from(payload.params.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  assert.deepEqual(params, { mallNo: "101" });
});

test("含中文等非 ASCII 字段时 MD5 按 UTF-8 计算，签名与 node:crypto 一致", () => {
  const harness = runSignin({ trigger: "auto-interval", store: {} });
  for (const input of ["é", "小米的iPhone", "deviceParams={\"name\":\"张三的iPhone 15\"}&😀"]) {
    const expected = crypto.createHash("md5").update(input, "utf8").digest("hex");
    assert.equal(harness.evaluate(`md5(${JSON.stringify(input)})`), expected, input);
  }

  harness.evaluate("Date.now = () => 1700000000000;");
  const template = { ...TEMPLATE, deviceParams: "{\"deviceName\":\"张三的iPhone\"}" };
  const payload = harness.evaluate(
    `buildPayload(${JSON.stringify(template)}, "mixc.app.memberSign.signDate", 0)`,
  );
  const canonical = Object.keys(payload)
    .filter((key) => key !== "sign")
    .sort()
    .map((key) => `${key}=${payload[key]}&`)
    .join("");
  const secret = harness.evaluate("SIGN_SECRET");
  assert.equal(payload.sign, crypto.createHash("md5").update(canonical + secret, "utf8").digest("hex"));
});

test("接口长时间无响应时在总时限内结束并写入缓存", async () => {
  // Fire the overall deadline immediately; drop the 12 s per-request timer so only the deadline can end the run.
  const fastTimeout = (fn, ms) => (ms >= 30000 ? setTimeout(fn, 0) : ms >= 10000 ? 0 : setTimeout(fn, ms));
  const harness = runSignin({
    trigger: "button",
    store: readyStore(),
    responses: [{ hang: true }],
    setTimeout: fastTimeout,
  });
  const result = await harness.donePromise;

  assert.equal(harness.state.doneCount, 1);
  assert.equal(result.style, "error");
  assert.match(result.content, /执行超时/);
  assert.equal(harness.state.store[LAST_RESULT_KEY], JSON.stringify(result));
});

test("脚本总时限小于模块 timeout", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const harness = runSignin({ trigger: "auto-interval", store: {} });
  const deadline = harness.evaluate("DEADLINE_MS");
  for (const file of ["MixcSignIn.sgmodule", "MixcSignIn-Test.sgmodule"]) {
    const text = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    for (const line of text.split("\n").filter((l) => /mixc_signin\.js/.test(l))) {
      const timeout = Number(line.match(/timeout=(\d+)/)[1]);
      assert.ok(deadline + 3 * 1000 <= timeout * 1000, `${file}: ${line.split(" =")[0]} timeout=${timeout}`);
    }
  }
});

test("凭据存储损坏时明确提示重新获取，不显示已记录", async () => {
  const harness = runSignin({ trigger: "cron", store: { [STORE_KEY]: "{not json" } });
  const result = await harness.donePromise;

  assert.equal(harness.state.httpCalls.length, 0);
  assert.equal(result.style, "alert");
  assert.match(result.content, /凭据数据损坏/);
  assert.match(result.content, /凭据：未获取/);
  assert.doesNotMatch(result.content, /已记录/);
  assert.match(harness.state.notifications[0].subtitle, /凭据数据损坏/);
});

test("运行异常时面板按存储实际状态显示凭据", async () => {
  const harness = runSignin({
    trigger: "cron",
    store: readyStore(),
    responses: [{ body: "<html>502</html>", status: 502 }],
  });
  // Credentials disappear mid-run (e.g. cleared by the user) before the error is reported.
  harness.state.store[STORE_KEY] = "";
  const result = await harness.donePromise;

  assert.match(result.content, /脚本运行异常/);
  assert.match(result.content, /凭据：未获取/);
});
