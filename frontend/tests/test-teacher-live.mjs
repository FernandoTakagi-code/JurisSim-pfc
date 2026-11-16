// Real browser -> authenticated Express API -> harness-owned disposable PostgreSQL.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const origin = "http://127.0.0.1:5199";
const api = new URL(process.env.JURISSIM_LIVE_BROWSER_API ?? "http://invalid");
assert.equal(api.hostname, "127.0.0.1");
assert(!["3333", "5173", "5174"].includes(api.port));
assert(
  process.env.JURISSIM_TEST_CAPABILITY &&
    process.env.JURISSIM_LIVE_BROWSER_TOKEN &&
    process.env.JURISSIM_LIVE_STUDENT_TOKEN,
);
const proof = await fetch(api.origin + "/test/disposable-proof").then((r) =>
  r.json(),
);
assert.equal(
  proof.capability,
  process.env.JURISSIM_TEST_CAPABILITY,
  "Refuse APIs without disposable database identity proof",
);
const browserPath =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
if (!browserPath)
  throw new Error(
    "Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.",
  );
const profile = await mkdtemp(path.join(tmpdir(), "jurissim-question-form-"));
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5199",
    "--strictPort",
  ],
  {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_API_URL: process.env.JURISSIM_LIVE_BROWSER_API,
      VITE_GOOGLE_CLIENT_ID: "",
    },
  },
);
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-background-networking",
    "about:blank",
  ],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
let closeBrowser;
let checks = 0;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Browser startup timed out")),
      20000,
    );
    browser.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    browser.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    ) {
      ready = true;
      break;
    }
    await sleep(100);
  }
  assert(ready, "Isolated Vite server must start");
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(task.timer);
      message.error
        ? task.reject(new Error(message.error.message))
        : task.resolve(message.result);
    }
    if (message.method === "Page.javascriptDialogOpening")
      void send(
        "Page.handleJavaScriptDialog",
        { accept: true },
        message.sessionId,
      );
    if (message.method === "Fetch.requestPaused") {
      const allowed =
        message.params.request.url.startsWith(origin + "/") ||
        message.params.request.url.startsWith(
          process.env.JURISSIM_LIVE_BROWSER_API + "/",
        );
      void send(
        allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        {
          requestId: message.params.requestId,
          ...(allowed ? {} : { errorReason: "BlockedByClient" }),
        },
        message.sessionId,
      ).catch(() => {});
    }
  });
  closeBrowser = () => send("Browser.close");
  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        "Isolated browser expression failed: " + expression.slice(0, 120),
      );
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 300; i++) {
      if (await evaluate("Boolean(" + expression + ")").catch(() => false))
        return;
      await sleep(50);
    }
    throw new Error(
      "Condition failed: " +
        expression +
        " State: " +
        JSON.stringify(
          await evaluate(
            "({path:location.pathname,text:document.body.innerText.slice(0,1500),requests:window.requests})",
          ),
        ),
    );
  };
  const pass = (name) => {
    checks++;
    console.log("PASS: " + name);
  };
  await cdp("Page.enable");
  await cdp("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `if(!sessionStorage.getItem('jurissim_token'))sessionStorage.setItem('jurissim_token',${JSON.stringify(process.env.JURISSIM_LIVE_BROWSER_TOKEN)});`,
  });
  const fill = async (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  const click = async (text) =>
    evaluate(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing action');b.click();})()`,
    );
  const open = async (route) => {
    await cdp("Page.navigate", { url: origin + route });
    await sleep(100);
  };
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await open("/professor/turmas");
  await until('document.querySelectorAll(".class-more-actions").length===3');
  const erase = async (name) => {
    await evaluate(
      `(()=>{const c=[...document.querySelectorAll('.class-list>article')].find(c=>c.querySelector('h2')?.textContent===${JSON.stringify(name)});c.querySelector('details').open=true;[...c.querySelectorAll('button')].find(b=>b.textContent==='Excluir turma').click();})()`,
    );
    await until('document.querySelector("dialog[open]")');
    assert.equal(
      await evaluate(
        'document.querySelector("dialog[open] button.danger").disabled',
      ),
      true,
    );
    await fill("dialog[open] input", name);
    await evaluate('document.querySelector("dialog[open] button.danger").click()');
    await until(
      '![...document.querySelectorAll(".class-list>article h2")].some(e=>e.textContent===' +
        JSON.stringify(name) +
        ")",
    );
  };
  await erase("Browser exclusão vazia");
  pass(
    "real API physically deletes an empty active class after explicit confirmation",
  );
  await erase("Browser arquivada vazia");
  pass("real API deletes an empty archived class distinctly from archiving");
  const classId = process.env.JURISSIM_LIVE_CLASS_ID;
  await open("/professor/atividades?turma=" + encodeURIComponent(classId));
  await until(
    'document.querySelector(".teacher-activity-manager .primary:not(:disabled)")',
  );
  await click("Criar atividade");
  await until('document.querySelector(".activity-editor")');
  await fill(
    ".activity-editor input:not([type])",
    "Atividade criada no navegador",
  );
  await fill(
    ".activity-editor textarea",
    "Questão privada da turma; API real e banco descartável.",
  );
  await until('document.querySelector(".activity-question input")');
  await evaluate('document.querySelector(".activity-question input").click()');
  await click("Salvar rascunho");
  await until(
    '!document.querySelector(".activity-editor")&&document.querySelector(".activity-card")',
  );
  await click("Publicar atividade");
  await until(
    'document.body.textContent.includes("Atividade publicada para os alunos matriculados.")',
  );
  pass(
    "teacher creates and publishes an activity from the existing class question through the real API",
  );
  await open('/professor/simulados?turma=' + encodeURIComponent(classId));
  await until('document.querySelector(".teacher-exams-create")');
  await click('Criar simulado');
  await until('document.querySelector("#exam-title")');
  await fill('#exam-title', 'Simulado validado no navegador');
  await fill('#exam-description', 'Registro exclusivo do PostgreSQL descartável.');
  await fill('#exam-duration', '30');
  await click('Próxima etapa');
  await until('document.querySelector(".exam-form fieldset:not([hidden]) input:checked")');
  await click('Próxima etapa');
  await until('document.querySelector(".exam-question-option input")');
  await evaluate('document.querySelector(".exam-question-option input").click()');
  await click('Próxima etapa');
  await click('Salvar rascunho');
  await until('!document.querySelector(".exam-form") && document.querySelector(".teacher-exam-card")');
  await evaluate('document.querySelector(".teacher-exam-more summary").click()');
  await click('Editar rascunho');
  await until('document.querySelector("#exam-title")');
  await fill('#exam-title', 'Simulado editado no navegador');
  await click('Próxima etapa');
  await click('Próxima etapa');
  await until('document.querySelector(".exam-question-option input:checked")');
  await click('Próxima etapa');
  await click('Salvar rascunho');
  await until('!document.querySelector(".exam-form") && document.querySelector(".teacher-exam-card")');
  await evaluate('document.querySelector(".teacher-exam-more summary").click()');
  await click('Publicar simulado');
  await until('document.querySelector(".teacher-exam-status.is-published")');
  await fill('.teacher-exams-search input', 'Nenhum simulado com este nome');
  await until('!document.querySelector(".teacher-exam-card")');
  await fill('.teacher-exams-search input', 'Simulado editado');
  await until('document.querySelector(".teacher-exam-card")');
  for (const action of ['Ver detalhes', 'Ver questões', 'Ver resultados']) {
    await click(action);
    await until('document.querySelector(".assessment-statistics")');
    assert.equal(await evaluate('document.querySelector(".assessment-details").textContent.includes("Nenhuma tentativa registrada")'), true);
    await click('Fechar detalhes');
  }
  const examEvidence = path.resolve('../backend/.local/teacher-exams-evidence');
  await (await import('node:fs/promises')).mkdir(examEvidence, { recursive: true });
  for (const width of [1440, 768, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".teacher-exams-search input")).paddingLeft) >= 38'), 'Search text must not overlap its icon');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".teacher-exams-create")).whiteSpace'), 'nowrap');
    assert.equal(await evaluate('document.querySelector(".teacher-exams-create").scrollWidth > document.querySelector(".teacher-exams-create").clientWidth'), false);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path.join(examEvidence, `exams-${width}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate('document.querySelector(".teacher-exam-more summary").click()');
  await click('Encerrar simulado');
  await until('document.querySelector(".teacher-exam-status.is-closed")');
  await evaluate('document.querySelector(".teacher-exam-more summary").click()');
  await click('Arquivar simulado');
  await until('!document.querySelector(".teacher-exam-card")');
  await evaluate('(()=>{const select=document.querySelectorAll(".teacher-exams-toolbar select")[1];select.value="ARCHIVED";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until('document.querySelector(".teacher-exam-status.is-archived")');
  await evaluate('(()=>{const select=document.querySelectorAll(".teacher-exams-toolbar select")[1];select.value="DRAFT";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until('!document.querySelector(".teacher-exam-card")');
  pass('teacher exam: class preselection, draft creation/edit, publication, details/questions/results, close/archive and responsive widths persist through the real disposable API');
  await open('/professor/atividades?turma=' + encodeURIComponent(classId));
  await until('document.querySelector(".activity-card")');
  const evidence = path.resolve(".artifacts/evidence/teacher-management-live");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(evidence, { recursive: true });
  for (const width of [1440, 768, 390]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    assert.equal(
      await evaluate("document.documentElement.scrollWidth>innerWidth"),
      false,
    );
    const shot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(
      path.join(evidence, `activities-${width}.png`),
      Buffer.from(shot.data, "base64"),
    );
  }
  await evaluate(
    'sessionStorage.setItem("jurissim_token",' +
      JSON.stringify(process.env.JURISSIM_LIVE_STUDENT_TOKEN) +
      ")",
  );
  await open("/turmas/" + encodeURIComponent(classId));
  await until('document.body.textContent.includes("Iniciar atividade")');
  await click("Iniciar atividade");
  await until('document.querySelector(".exam-attempt input[type=radio]")');
  assert.equal(
    await evaluate('document.body.textContent.includes("ATIVIDADE DA TURMA")'),
    true,
  );
  await evaluate(
    'document.querySelectorAll(".exam-attempt input[type=radio]")[1].click()',
  );
  await until(
    'document.querySelectorAll(".exam-attempt input[type=radio]")[1].checked&&!document.querySelectorAll(".exam-attempt input[type=radio]")[1].disabled',
  );
  await click("Finalizar atividade");
  await until(
    'document.querySelector(".exam-result")?.textContent.includes("100%")',
  );
  const attemptPath = await evaluate("location.pathname");
  const resultShot = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    path.join(evidence, "student-result.png"),
    Buffer.from(resultShot.data, "base64"),
  );
  pass(
    "enrolled student starts, answers and finishes the activity; real persisted result is 100%",
  );
  await evaluate(
    'sessionStorage.setItem("jurissim_token",' +
      JSON.stringify(process.env.JURISSIM_LIVE_BROWSER_TOKEN) +
      ")",
  );
  await open("/professor/atividades?turma=" + encodeURIComponent(classId));
  await until('document.body.textContent.includes("Encerrar novos inícios")');
  await click("Encerrar novos inícios");
  await until(
    'document.body.textContent.includes("Novos inícios encerrados.")',
  );
  await open("/professor/turmas");
  await until('document.querySelector(".class-more-actions")');
  await erase("Browser atividade");
  pass(
    "teacher closes the activity and real API logically deletes its dependent class",
  );
  await evaluate(
    'sessionStorage.setItem("jurissim_token",' +
      JSON.stringify(process.env.JURISSIM_LIVE_STUDENT_TOKEN) +
      ")",
  );
  await open(attemptPath);
  await until(
    'document.querySelector(".exam-result")?.textContent.includes("100%")',
  );
  await open("/turmas");
  await until('document.body.textContent.includes("Minhas turmas")');
  assert.equal(
    await evaluate('!!document.querySelector(".student-class-card")'),
    false,
  );
  pass(
    "student retains authorized access to completed result while deleted class leaves operational lists",
  );
  console.log(
    checks +
      " live browser scenarios passed against authenticated API and disposable PostgreSQL.",
  );
} finally {
  try {
    await closeBrowser?.();
  } catch {}
  socket?.close();
  browser.kill();
  vite.kill();
}
