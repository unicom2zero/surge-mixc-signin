"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadScript, storedCredentials } = require("./surge-mock");

const STORE_KEY = "mixc_signin_credentials_v1";
const GATEWAY = "https://app.mixcapp.com/mixc/gateway";

function runCapture(options) {
  return loadScript("mixc_capture.js", options);
}

test("签到接口请求会重建干净模板", () => {
  const harness = runCapture({
    request: {
      url: GATEWAY,
      body: [
        "action=mixc.app.memberSign.signDate",
        "appId=mall-app",
        "mallNo=101",
        "token=TOKEN-A",
        "platform=ios",
        "deviceParams=DEVICE-A",
        "apiVersion=1.0",
        "sign=deadbeef",
        `timestamp=1700000000000`,
        "date=2023-11-15 12:00:00",
        "t=1700000000000",
      ].join("&"),
      headers: { Cookie: "sid=abc", "User-Agent": "MixcApp/1.0", "X-Mixc-Swimlane": "prod" },
    },
  });

  const saved = JSON.parse(harness.state.store[STORE_KEY]);
  assert.equal(saved.templateVersion, 2);
  assert.equal(saved.sourceAction, "mixc.app.memberSign.signDate");
  assert.equal(saved.template.appId, "mall-app");
  assert.equal(saved.template.mallNo, "101");
  assert.equal(saved.template.token, "TOKEN-A");
  assert.equal(saved.template.deviceParams, "DEVICE-A");
  assert.equal(saved.template.platform, "ios");
  assert.equal(saved.template.apiVersion, "1.0");
  assert.equal(saved.headers.Cookie, "sid=abc");
  assert.equal(saved.headers["User-Agent"], "MixcApp/1.0");
  assert.equal(saved.headers["X-Mixc-Swimlane"], "prod");
  assert.equal(saved.templateCapturedAt, saved.capturedAt);
  assert.match(harness.state.logs.join("\n"), /凭据已刷新/);
});

test("易变字段不会写入模板", () => {
  const harness = runCapture({
    request: {
      url: GATEWAY,
      body: "action=mixc.app.memberSign.sign&appId=a&mallNo=101&token=T&platform=ios&deviceParams=D&sign=x&params=y&timestamp=1&date=d&t=1",
      headers: {},
    },
  });

  const saved = JSON.parse(harness.state.store[STORE_KEY]);
  for (const key of ["action", "sign", "params", "timestamp", "date", "t"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(saved.template, key), false, `${key} 不应进入模板`);
  }
});

test("模板未初始化时只提示，不写存储", () => {
  const harness = runCapture({
    request: {
      url: GATEWAY,
      body: "action=mixc.app.user.info&token=TOKEN-A",
      headers: { Cookie: "sid=abc" },
    },
  });

  assert.equal(harness.state.writes.length, 0);
  assert.match(harness.state.logs.join("\n"), /尚未初始化/);
});

test("普通请求只增量刷新凭据，不覆盖签到固定字段", () => {
  const template = {
    appId: "mall-app",
    mallNo: "101",
    token: "TOKEN-OLD",
    platform: "ios",
    deviceParams: "DEVICE-OLD",
    apiVersion: "1.0",
  };
  const harness = runCapture({
    store: { [STORE_KEY]: storedCredentials(template, { Cookie: "sid=old" }) },
    request: {
      url: GATEWAY,
      body: "action=mixc.app.user.info&token=TOKEN-NEW&deviceParams=DEVICE-NEW&mallNo=999&appId=hijack&apiVersion=9.9",
      headers: { Cookie: "sid=new" },
    },
  });

  const saved = JSON.parse(harness.state.store[STORE_KEY]);
  assert.equal(saved.template.token, "TOKEN-NEW");
  assert.equal(saved.template.deviceParams, "DEVICE-NEW");
  assert.equal(saved.template.mallNo, "101");
  assert.equal(saved.template.appId, "mall-app");
  assert.equal(saved.template.apiVersion, "1.0");
  assert.equal(saved.headers.Cookie, "sid=new");
  assert.equal(saved.templateCapturedAt, 1700000000000);
});

test("重登录后普通请求会刷新 token、会话字段与 cookie", () => {
  const template = {
    appId: "mall-app",
    mallNo: "101",
    token: "TOKEN-OLD",
    platform: "ios",
    deviceParams: "DEVICE-OLD",
    sessionId: "S-1",
  };
  const harness = runCapture({
    store: { [STORE_KEY]: storedCredentials(template, { Cookie: "sid=old", Authorization: "Bearer old" }) },
    request: {
      url: `${GATEWAY}?trace=1`,
      body: "action=mixc.app.user.login&token=TOKEN-REL&sessionId=S-2",
      headers: { Cookie: "sid=new", Authorization: "Bearer new", "X-Mixc-Swimlane": "prod" },
    },
  });

  const saved = JSON.parse(harness.state.store[STORE_KEY]);
  assert.equal(saved.template.token, "TOKEN-REL");
  assert.equal(saved.template.sessionId, "S-2");
  assert.equal(saved.headers.Cookie, "sid=new");
  assert.equal(saved.headers.Authorization, "Bearer new");
  assert.equal(saved.templateCapturedAt, 1700000000000);
});

test("普通请求不会把模板里没有的字段写进模板", () => {
  const template = { appId: "mall-app", mallNo: "101", token: "TOKEN-OLD", platform: "ios", deviceParams: "D" };
  const harness = runCapture({
    store: { [STORE_KEY]: storedCredentials(template, {}) },
    request: {
      url: GATEWAY,
      body: "action=mixc.app.user.info&token=TOKEN-NEW&sessionId=S-9&userToken=UT&memberId=M1",
      headers: {},
    },
  });

  const saved = JSON.parse(harness.state.store[STORE_KEY]);
  assert.equal(saved.template.token, "TOKEN-NEW");
  for (const key of ["sessionId", "userToken", "memberId"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(saved.template, key), false, `${key} 不应新增到模板`);
  }
});

test("空值不会覆盖已有凭据", () => {
  const template = { appId: "a", mallNo: "101", token: "TOKEN-OLD", platform: "ios", deviceParams: "D" };
  const harness = runCapture({
    store: { [STORE_KEY]: storedCredentials(template, { Cookie: "sid=old" }) },
    request: {
      url: GATEWAY,
      body: "action=mixc.app.user.info&token=&deviceParams=",
      headers: { Cookie: "" },
    },
  });

  const saved = JSON.parse(harness.state.store[STORE_KEY]);
  assert.equal(saved.template.token, "TOKEN-OLD");
  assert.equal(saved.template.deviceParams, "D");
  assert.equal(saved.headers.Cookie, "sid=old");
});

test("请求体为空或异常不会抛错，仍然放行请求", () => {
  const harness = runCapture({ request: { url: `${GATEWAY}`, body: "", headers: {} } });
  assert.equal(harness.state.doneCount, 1);
  assert.equal(Object.keys(harness.state.done).length, 0);
});

test("单个字段编码异常时只跳过该字段，其余凭据照常刷新", () => {
  const harness = runCapture({
    request: {
      url: GATEWAY,
      body: [
        "action=mixc.app.memberSign.signDate",
        "appId=mall-app",
        "mallNo=101",
        "token=TOKEN-A",
        "platform=ios",
        "deviceParams=%E5%B0%8F%E7%B1%B3",
        "broken=%E5%",
        "apiVersion=1.0",
      ].join("&"),
      headers: { Cookie: "sid=abc" },
    },
  });

  const saved = JSON.parse(harness.state.store[STORE_KEY]);
  assert.equal(saved.template.token, "TOKEN-A");
  assert.equal(saved.template.deviceParams, "小米");
  assert.equal(Object.prototype.hasOwnProperty.call(saved.template, "broken"), false);
  assert.equal(harness.state.doneCount, 1);
});
