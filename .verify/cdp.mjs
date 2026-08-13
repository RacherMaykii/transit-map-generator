// 极简 CDP 客户端：用系统 ws + fetch 启动 Edge 并驱动页面
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";

const EDGE = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = process.env.CDP_PORT || 9322;
const PROFILE = process.env.CDP_PROFILE || ".verify/profile";
// Edge 在 Windows 上把相对 --user-data-dir 相对自身可执行目录解析，必须给绝对路径
const ABS_PROFILE = resolve(PROFILE);

let ws;
let msgId = 0;
const pending = new Map();

export function startBrowser() {
  return new Promise((resolve, reject) => {
    const proc = spawn(EDGE, [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${ABS_PROFILE}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ], { stdio: "ignore" });
    // 等待调试端口就绪
    const deadline = Date.now() + 20000;
    const poll = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) return resolve(proc);
      } catch { /* not ready */ }
      if (Date.now() > deadline) return reject(new Error("CDP 端口未就绪"));
      setTimeout(poll, 200);
    };
    poll();
  });
}

export async function newPage(url) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await res.json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        const what = entry.expression ? `evalJs(${entry.expression.slice(0, 200)})` : `${entry.method}(${JSON.stringify(entry.params).slice(0, 160)})`;
        entry.reject(new Error(`${msg.error.message}  ← ${what}`));
      }
      else entry.resolve(msg.result);
    }
  });
  return target;
}

export function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method, params });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

export async function evalJs(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error("页面执行错误: " + JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

export async function waitFor(expression, timeout = 15000, interval = 200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await evalJs(`Boolean(${expression})`);
      if (value) return;
    } catch { /* keep waiting */ }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("等待超时: " + expression);
}

export async function screenshot(file) {
  const result = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(result.data, "base64"));
}

export async function clickAt(clientX, clientY) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: clientX, y: clientY, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clientX, y: clientY, button: "left", clickCount: 1 });
}

export async function textInput(text) {
  await send("Input.insertText", { text });
}
