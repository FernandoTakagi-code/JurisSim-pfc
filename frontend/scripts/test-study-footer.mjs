import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const origin = "http://127.0.0.1:5183";
const profile = await mkdtemp(path.join(tmpdir(), "jurissim-study-layout-"));
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5183", "--strictPort"], {
  windowsHide: true,
  stdio: "ignore",
  env: { ...process.env, VITE_API_URL: "http://127.0.0.1:1", VITE_GOOGLE_CLIENT_ID: "", VITE_INITIAL_DIAGNOSTIC_UI_ENABLED: "false", VITE_QUESTION_PRACTICE_UI_ENABLED: "false" },
});
const browser = spawn(process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank",
], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let closeBrowser;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome startup timeout")), 20000);
    browser.on("error", reject);
    browser.stderr.on("data", chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  for (let index = 0; index < 80; index++) {
    if (await fetch(origin).then(response => response.ok).catch(() => false)) break;
    await sleep(100);
  }
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Unable to connect to local Chrome debugger")), { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  closeBrowser = () => send("Browser.close");
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    }
    if (message.method === "Fetch.requestPaused") {
      const allowed = message.params.request.url.startsWith(origin + "/");
      void send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId: message.params.requestId, ...(allowed ? {} : { errorReason: "BlockedByClient" }),
      }, message.sessionId).catch(() => {});
    }
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`Browser expression failed: ${expression.slice(0, 140)}`);
    return result.result.value;
  };
  const until = async expression => {
    for (let index = 0; index < 160; index++) {
      try { if (await evaluate(expression)) return; } catch {}
      await sleep(50);
    }
    throw new Error(`Condition failed: ${expression}`);
  };
  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    sessionStorage.setItem('jurissim_token', 'layout-fixture-token');
    window.fetch = async (input) => {
      const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
      if (path === '/auth/session') return new Response(JSON.stringify({ user: { id: 'layout-fixture', nome: 'Estudante de teste', email: 'study@example.invalid', role: 'ALUNO', emailVerificado: true }, nextStep: 'DASHBOARD' }), { status: 200 });
      if (path === '/students/me/overview') return new Response(JSON.stringify({ totals: { completedActivities: 0 }, latestDiagnosticId: null, evolution: [], recentActivities: [] }), { status: 200 });
      return new Response(JSON.stringify({ items: [], questions: [], turmas: [], data: [] }), { status: 200 });
    };
  ` });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${origin}/estudar` });
  try { await until("!!document.querySelector('.study-module-list') && !!document.querySelector('.app-legal-footer')"); }
  catch { throw new Error(`Initial /estudar did not render; ${await evaluate("location.href + ' :: ' + document.body.innerText.slice(0, 350)")}`); }
  assert.equal(await evaluate("document.querySelector('.app-legal-footer .legal-links')?.textContent.includes('Termos de Uso')"), true, "/estudar list footer links");

  await evaluate("[...document.querySelectorAll('.study-discipline-panel button')].find(button => button.textContent.includes('Direito Administrativo')).click()");
  await until("!!document.querySelector('.study-module-list button') && [...document.querySelectorAll('.study-module-list button')].some(button => button.textContent.includes('Princípios da Administração Pública'))");
  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 500, downloadThroughput: 30000, uploadThroughput: 30000, connectionType: "cellular3g" });
  await evaluate("[...document.querySelectorAll('.study-module-list button')].find(button => button.textContent.includes('Princípios da Administração Pública')).click()");
  await until("!!document.querySelector('.study-module-list button[aria-busy=true]') || !!document.querySelector('.study-lesson')");
  const pendingView = await evaluate("({ list: !!document.querySelector('.study-module-list'), footer: !!document.querySelector('.app-legal-footer .legal-links'), lesson: !!document.querySelector('.study-lesson') })");
  if (pendingView.list) assert.equal(pendingView.footer, true, "footer remains while the lesson chunk loads");
  await until("!!document.querySelector('.study-lesson') && document.querySelector('.study-module-detail h2')?.textContent.includes('Princípios da Administração Pública')");
  assert.equal(await evaluate("!!document.querySelector('.app-legal-footer .legal-links')"), true, "footer remains after lesson opens");
  assert.equal(await evaluate("Boolean(document.querySelector('.study-module-detail').compareDocumentPosition(document.querySelector('.app-legal-footer')) & Node.DOCUMENT_POSITION_FOLLOWING)"), true, "footer remains after the study content in document flow");
  assert.equal(await evaluate("document.documentElement.scrollHeight > window.innerHeight"), true, "lesson page remains scrollable");
  await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  assert.equal(await evaluate("document.querySelector('.app-legal-footer').getBoundingClientRect().bottom <= window.innerHeight + 1"), true, "footer is reachable after scrolling to the lesson end");
  await evaluate("document.querySelector('.study-back-link').click()");
  await until("!!document.querySelector('.study-module-list')");
  assert.equal(await evaluate("!!document.querySelector('.app-legal-footer .legal-links')"), true, "footer remains after returning to the module list");

  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });
  for (const [route, selector] of [["/dashboard", ".dashboard-page"], ["/desempenho", ".page h1"], ["/simulados", ".class-exams-page h1"], ["/questoes", ".practice-picker"], ["/trilha", ".study-trail-page"], ["/turmas", ".class-exams-page h1"], ["/perfil", ".v0-page"], ["/configuracoes", ".v0-page"]]) {
    await evaluate(`history.pushState({}, '', ${JSON.stringify(route)}); window.dispatchEvent(new PopStateEvent('popstate'))`);
    try { await until(`!!document.querySelector(${JSON.stringify(selector)}) && !!document.querySelector('.app-legal-footer .legal-links')`); }
    catch { throw new Error(`${route} did not render ${selector}; page: ${(await evaluate("document.body.innerText")).slice(0, 240)}`); }
  }
  console.log("PASS: Estudar list/open/back/scroll/footer, plus dashboard, performance, exams, questions, trail, classes, profile and settings smoke routes (mock API, local Chromium).");
} finally {
  try { await closeBrowser?.(); } catch {}
  socket?.close();
  browser.kill();
  vite.kill();
  await sleep(1000);
  if (path.resolve(profile).startsWith(path.resolve(tmpdir()) + path.sep)) {
    try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.error(`Temporary Chromium profile cleanup failed: ${error.code ?? "unknown error"}`); }
  }
}
