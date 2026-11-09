// Targeted fixture tests only. Never reads .env, accepts a remote URL or uses an
// existing PostgreSQL service. Creates and stops its own loopback cluster.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  net = require("node:net");
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const { bootstrapFirstAdmin } = require("./lib/first-admin-bootstrap.cjs");
const bin = "C:/Program Files/PostgreSQL/17/bin";
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "jurissim-bootstrap-security-"),
);
const data = path.join(root, "data"),
  operator = "fixture_" + randomBytes(5).toString("hex"),
  password = randomBytes(24).toString("hex");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    [
      "PATH",
      "SYSTEMROOT",
      "WINDIR",
      "COMSPEC",
      "TEMP",
      "TMP",
      "APPDATA",
      "LOCALAPPDATA",
    ].includes(k.toUpperCase()),
  ),
);
let port,
  started = false,
  counter = 0,
  checks = 0;
const clients = [];
const id1 = "00000000-0000-4000-8000-000000000001",
  id2 = "00000000-0000-4000-8000-000000000002";
function run(name, args, label, input, controller = false) {
  const fd = fs.openSync(path.join(root, label + ".log"), "wx");
  let result;
  try {
    result = spawnSync(path.join(bin, name + ".exe"), args, {
      env,
      input,
      stdio: ["pipe", controller ? "ignore" : "pipe", fd],
      encoding: "utf8",
      windowsHide: true,
      timeout: 60000,
    });
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(result.status, 0, "Local command failed: " + label);
  return result.stdout;
}
function sql(db, text, label) {
  return run(
    "psql",
    [
      "-X",
      "-w",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "--dbname=" + db,
      "-f",
      "-",
    ],
    label,
    text,
  ).trim();
}
const fixture = `CREATE TYPE "Role" AS ENUM ('ADMIN','PROFESSOR','ALUNO');
CREATE TABLE "User" (id text PRIMARY KEY,nome text NOT NULL,email text UNIQUE NOT NULL,"senhaHash" text,"role" "Role" NOT NULL,"sessionVersion" integer NOT NULL DEFAULT 7,"emailVerifiedAt" timestamp,"deletedAt" timestamp);
CREATE TABLE "AccountControl" ("userId" text PRIMARY KEY,suspended boolean NOT NULL DEFAULT false);
CREATE TABLE "AdministrativeEvent" (id text PRIMARY KEY,"occurredAt" timestamp NOT NULL DEFAULT now(),event text NOT NULL,"actorId" text,"institutionId" text,"resourceId" text,result text NOT NULL,severity text NOT NULL DEFAULT 'INFO');
CREATE TABLE "_prisma_migrations" (migration_name text PRIMARY KEY,finished_at timestamp,rolled_back_at timestamp);
INSERT INTO "_prisma_migrations" VALUES ('20261104000100_institutions_administration',now(),null);
CREATE TABLE "AcademicHistory" ("userId" text PRIMARY KEY,content text NOT NULL);
INSERT INTO "User" (id,nome,email,"senhaHash",role,"emailVerifiedAt") VALUES
('${id1}','Fixture One','one@example.invalid','opaque-fixture-password-hash','ALUNO',now()),
('${id2}','Fixture Two','two@example.invalid','another-fixture-password-hash','ALUNO',now());
INSERT INTO "AcademicHistory" VALUES ('${id1}','history stays unchanged');`;
async function fresh() {
  const name = "case_" + ++counter;
  sql("postgres", "CREATE DATABASE " + name + ";", "create-" + name);
  sql(name, fixture, "fixture-" + name);
  const url =
    "postgresql://" +
    operator +
    ":" +
    password +
    "@127.0.0.1:" +
    port +
    "/" +
    name +
    "?schema=public";
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  const p = new PrismaClient({ datasourceUrl: url });
  clients.push(p);
  return { name, url, p };
}
async function observe(p) {
  return {
    users: await p.$queryRawUnsafe(
      'SELECT id,nome,email,"senhaHash",role::text,"sessionVersion","emailVerifiedAt","deletedAt" FROM "User" ORDER BY id',
    ),
    history: await p.$queryRawUnsafe('SELECT * FROM "AcademicHistory"'),
    events: await p.administrativeEvent.count(),
  };
}
const pass = (name) => {
  checks++;
  console.log("PASS: " + name);
};
async function concurrent(sameTarget) {
  const { p, url } = await fresh();
  const a = new PrismaClient({ datasourceUrl: url }),
    b = new PrismaClient({ datasourceUrl: url }),
    holder = new PrismaClient({ datasourceUrl: url });
  clients.push(a, b, holder);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let locked;
  const ready = new Promise((resolve) => {
    locked = resolve;
  });
  const blocker = holder.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(710911)`;
      locked();
      await held;
    },
    { timeout: 10000 },
  );
  await ready;
  const tasks = [
    bootstrapFirstAdmin(a, id1),
    bootstrapFirstAdmin(b, sameTarget ? id1 : id2),
  ];
  const outcomes = Promise.allSettled(tasks);
  let waiting = 0;
  try {
    for (let i = 0; i < 100; i++) {
      const rows = await p.$queryRawUnsafe(
        "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock(710911)%'",
      );
      waiting = rows[0].waiting;
      if (waiting >= 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    release();
    await blocker;
  }
  assert.ok(
    waiting >= 2,
    "Both real transactions must overlap at the advisory lock",
  );
  const results = await outcomes;
  const state = await observe(p);
  assert.equal(state.users.filter((u) => u.role === "ADMIN").length, 1);
  assert.equal(state.events, 1);
  assert.equal(state.users.filter((u) => u.sessionVersion === 8).length, 1);
  if (sameTarget) {
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    assert.deepEqual(results.map((r) => r.value.status).sort(), [
      "ALREADY_PROVISIONED",
      "PROVISIONED",
    ]);
  } else {
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  }
  pass(
    sameTarget
      ? "same-account concurrent execution is an exact no-op on repeat"
      : "different-account concurrent execution never creates a second administrator",
  );
}
(async () => {
  assert.equal(
    process.argv.length,
    2,
    "This fixture harness takes no database arguments",
  );
  const pw = path.join(root, "fixture-password.tmp");
  fs.writeFileSync(pw, password + "\n", { flag: "wx" });
  try {
    run(
      "initdb",
      [
        "-D",
        data,
        "-U",
        operator,
        "--pwfile=" + pw,
        "--auth-local=scram-sha-256",
        "--auth-host=scram-sha-256",
        "--encoding=UTF8",
        "--no-locale",
      ],
      "initdb",
    );
  } finally {
    fs.unlinkSync(pw);
  }
  port = await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const chosen = s.address().port;
      s.close(() => resolve(chosen));
    });
  });
  Object.assign(env, {
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGUSER: operator,
    PGPASSWORD: password,
    PGSSLMODE: "disable",
    PGCONNECT_TIMEOUT: "5",
  });
  run(
    "pg_ctl",
    [
      "-D",
      data,
      "-l",
      path.join(root, "postgres.log"),
      "-o",
      "-h 127.0.0.1 -p " + port,
      "-w",
      "-t",
      "30",
      "start",
    ],
    "start",
    undefined,
    true,
  );
  started = true;
  const identity = JSON.parse(
    sql(
      "postgres",
      "SELECT json_build_object('directory',current_setting('data_directory'),'address',host(inet_server_addr()),'port',inet_server_port());",
      "identity",
    ),
  );
  assert.equal(
    path.resolve(identity.directory).toLowerCase(),
    data.toLowerCase(),
  );
  assert.equal(identity.address, "127.0.0.1");
  assert.equal(identity.port, port);
  console.log(
    "Isolated PostgreSQL cluster verified. Synthetic fixtures only; shared database is never used.",
  );
  const { p } = await fresh();
  const before = await observe(p);
  assert.deepEqual(await bootstrapFirstAdmin(p, id1), {
    status: "PROVISIONED",
  });
  const first = await observe(p);
  assert.equal(first.users[0].role, "ADMIN");
  assert.equal(first.users[0].sessionVersion, 8);
  for (const key of [
    "id",
    "nome",
    "email",
    "senhaHash",
    "emailVerifiedAt",
    "deletedAt",
  ])
    assert.deepEqual(first.users[0][key], before.users[0][key]);
  assert.deepEqual(first.users[1], before.users[1]);
  assert.deepEqual(first.history, before.history);
  pass(
    "first bootstrap preserves identity, password, history and other accounts while revoking old sessions",
  );
  assert.deepEqual(await bootstrapFirstAdmin(p, id1), {
    status: "ALREADY_PROVISIONED",
  });
  assert.deepEqual(await observe(p), first);
  pass(
    "repetition preserves sessions and audit without granting privileges again",
  );
  await assert.rejects(bootstrapFirstAdmin(p, id2), /ALREADY_CLOSED/);
  assert.deepEqual(await observe(p), first);
  pass("second account cannot be promoted by bootstrap");
  for (const reason of ["unverified", "deleted", "suspended", "teacher"]) {
    const f = await fresh();
    let statement;
    if (reason === "unverified")
      statement = `UPDATE "User" SET "emailVerifiedAt"=null WHERE id='${id1}'`;
    if (reason === "deleted")
      statement = `UPDATE "User" SET "deletedAt"=now() WHERE id='${id1}'`;
    if (reason === "suspended")
      statement = `INSERT INTO "AccountControl" VALUES ('${id1}',true)`;
    if (reason === "teacher")
      statement = `UPDATE "User" SET role='PROFESSOR' WHERE id='${id1}'`;
    await f.p.$executeRawUnsafe(statement);
    const unchanged = await observe(f.p);
    await assert.rejects(bootstrapFirstAdmin(f.p, id1), /BOOTSTRAP_/);
    assert.deepEqual(await observe(f.p), unchanged);
    pass(reason + " account is refused without writes");
  }
  const auditFail = await fresh();
  await auditFail.p.$executeRawUnsafe(
    "CREATE FUNCTION reject_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit rejection'; END $$",
  );
  await auditFail.p.$executeRawUnsafe(
    'CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON "AdministrativeEvent" FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit()',
  );
  const old = await observe(auditFail.p);
  await assert.rejects(bootstrapFirstAdmin(auditFail.p, id1));
  assert.deepEqual(await observe(auditFail.p), old);
  pass("audit failure rolls back role and sessionVersion atomically");
  await concurrent(false);
  await concurrent(true);
  console.log(
    JSON.stringify({
      targetedChecksPassed: checks,
      realOverlappingTransactions: true,
      sharedDatabaseAccessed: false,
    }),
  );
})()
  .catch((error) => {
    fs.writeFileSync(
      path.join(root, "failure.private.log"),
      String(error.stack || error)
        .split(password)
        .join("[REDACTED]")
        .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[private connection]"),
    );
    console.error(
      JSON.stringify({ failed: true, code: error.code, diagnostics: root }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled(clients.map((p) => p.$disconnect()));
    if (started) {
      try {
        run(
          "pg_ctl",
          ["-D", data, "-m", "fast", "-w", "-t", "30", "stop"],
          "stop",
          undefined,
          true,
        );
        console.log("Isolated cluster stopped.");
      } catch {
        console.error("Could not confirm isolated cluster shutdown.");
        process.exitCode = 1;
      }
    }
  });
