// Headless Chromium driver over the DevTools protocol (no Playwright dependency).
// Each makePage() call is an isolated browser context (own localStorage), like a separate device.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

export async function launch({ chromium = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", port = 9444 + Math.floor(Math.random() * 500) } = {}) {
  const chrome = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`, "--window-size=420,860", "about:blank"], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 40; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); } }
  if (!version) throw new Error("chromium did not start");
  const bws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, j) => { bws.onopen = r; bws.onerror = j; });
  let id = 0; const pending = new Map(); const sessions = new Map();
  bws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.sessionId && sessions.has(msg.sessionId)) sessions.get(msg.sessionId)(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); bws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  async function makePage({ name = "page", init = "" } = {}) {
    const { result: { browserContextId } } = await send("Target.createBrowserContext");
    const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank", browserContextId });
    const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
    const logs = [], errors = [];
    sessions.set(sessionId, (msg) => {
      if (msg.method === "Runtime.consoleAPICalled") logs.push(`[${name}:${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(" "));
      if (msg.method === "Runtime.exceptionThrown") errors.push(`[${name}] ` + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
    });
    const s = (m, p) => send(m, p, sessionId);
    await s("Runtime.enable"); await s("Page.enable");
    await s("Emulation.setDeviceMetricsOverride", { width: 420, height: 860, deviceScaleFactor: 1, mobile: true });
    if (init) await s("Page.addScriptToEvaluateOnNewDocument", { source: init });
    return {
      name, logs, errors,
      async goto(url, wait = 1200) { await s("Page.navigate", { url }); await sleep(wait); },
      async eval(expr) { const r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(`[${name}] ` + (r.result.exceptionDetails.exception?.description ?? "eval error")); return r.result.result.value; },
      async click(sel, wait = 400) { await this.eval(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(wait); },
      async shot(file) { const r = await s("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(r.result.data, "base64")); },
    };
  }
  return { makePage, close() { try { bws.close(); } catch {} chrome.kill(); } };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function check(cond, msg) { if (!cond) throw new Error("e2e assertion failed: " + msg); console.log("  ok  " + msg); }
