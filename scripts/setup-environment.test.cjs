const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setupEnvironment } = require("./setup-environment.cjs");

test("creates independent JWT keys and never overwrites existing environment files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jurissim-env-"));
  for (const folder of ["backend", "frontend"]) {
    fs.mkdirSync(path.join(root, folder));
    fs.writeFileSync(
      path.join(root, folder, ".env.example"),
      folder === "backend"
        ? "JWT_SECRET=placeholder\nDATABASE_URL=placeholder\n"
        : "VITE_API_URL=http://localhost:3333\n",
    );
  }
  assert.equal(setupEnvironment(root).length, 2);
  const original = fs.readFileSync(path.join(root, "backend", ".env"), "utf8");
  assert.match(original, /JWT_SECRET="[a-f0-9]{96}"/);
  assert.match(original, /DATABASE_URL=placeholder/);
  assert.ok(setupEnvironment(root).every((s) => s.includes("preservado")));
  assert.equal(
    fs.readFileSync(path.join(root, "backend", ".env"), "utf8"),
    original,
  );
});
