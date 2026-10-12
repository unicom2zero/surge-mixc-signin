"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function createHarness(options = {}) {
  const {
    trigger,
    argument,
    request = {},
    store = {},
    responses = [],
    setTimeout: scheduleTimeout = setTimeout,
  } = options;

  const state = {
    store: { ...store },
    writes: [],
    httpCalls: [],
    notifications: [],
    logs: [],
    done: null,
    doneCount: 0,
  };

  let resolveDone;
  const donePromise = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const sandbox = {
    console: { log: (...args) => state.logs.push(args.join(" ")) },
    TextEncoder,
    btoa,
    setTimeout: (fn, ms) => scheduleTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    $request: request,
    $persistentStore: {
      read(key) {
        return Object.prototype.hasOwnProperty.call(state.store, key) ? state.store[key] : null;
      },
      write(value, key) {
        state.store[key] = value;
        state.writes.push({ key, value });
      },
    },
    $httpClient: {
      post(requestOptions, callback) {
        state.httpCalls.push(requestOptions);
        const next = responses[state.httpCalls.length - 1];
        if (!next) {
          callback("测试未配置模拟响应", { status: 0 }, "");
          return;
        }
        if (next.hang) return;
        if (next.error) {
          callback(next.error, { status: 0 }, "");
          return;
        }
        const status = next.status === undefined ? 200 : next.status;
        const body = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
        setTimeout(() => callback(null, { status }, body), 0);
      },
    },
    $notification: {
      post(title, subtitle, body) {
        state.notifications.push({ title, subtitle, body });
      },
    },
    $done(value) {
      state.doneCount += 1;
      state.done = value;
      if (state.doneCount === 1) resolveDone(value);
    },
  };

  if (trigger !== undefined) sandbox.$trigger = trigger;
  if (argument !== undefined) sandbox.$argument = argument;

  const context = vm.createContext(sandbox);

  return {
    state,
    donePromise,
    context,
    evaluate(code) {
      return vm.runInContext(code, context);
    },
  };
}

function loadScript(file, options = {}) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const harness = createHarness(options);
  vm.runInContext(source, harness.context, { filename: file });
  return harness;
}

function formFields(body) {
  const fields = {};
  for (const item of String(body || "").split("&")) {
    if (!item) continue;
    const index = item.indexOf("=");
    const key = decodeURIComponent(index < 0 ? item : item.slice(0, index));
    const value = decodeURIComponent(index < 0 ? "" : item.slice(index + 1));
    fields[key] = value;
  }
  return fields;
}

function storedCredentials(template, headers = {}) {
  return JSON.stringify({
    template,
    headers,
    templateVersion: 2,
    templateCapturedAt: 1700000000000,
    capturedAt: 1700000000000,
    sourceAction: "mixc.app.user.info",
  });
}

module.exports = { ROOT, createHarness, loadScript, formFields, storedCredentials };
