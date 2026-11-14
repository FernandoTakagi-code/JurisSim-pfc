const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.length !== 3 || !process.env.JURISSIM_K6_BIN || !fs.existsSync(process.env.JURISSIM_K6_BIN)) {
  console.error('Set JURISSIM_K6_BIN to the official executable, then: npm run test:load:disposable -- <PostgreSQL-17-bin>');
  process.exit(1);
}
const result = spawnSync(process.execPath, [path.resolve(__dirname, '..', 'test-migrations-local.cjs'), process.argv[2], '--load-only'], {
  cwd: path.resolve(__dirname, '..', '..'), env: process.env, stdio: 'inherit', windowsHide: true,
});
if (result.error) console.error('Could not start the isolated load harness.');
process.exitCode = result.status ?? 1;
