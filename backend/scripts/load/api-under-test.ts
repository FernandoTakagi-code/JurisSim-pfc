import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase } from '../../src/__tests__/integration/disposable-database';

async function main() {
  const proof = new PrismaClient();
  await assertDisposableDatabase(proof);
  await proof.$disconnect();
  const output = process.env.JURISSIM_LOAD_RUNTIME_FILE;
  if (!output) throw new Error('Runtime report is required.');
  await import('../../src/server');
  let previousCpu = process.cpuUsage(), previousTime = performance.now(), previousLoop = performance.eventLoopUtilization();
  setInterval(() => {
    const now = performance.now(), cpu = process.cpuUsage(), loop = performance.eventLoopUtilization();
    fs.appendFileSync(output, JSON.stringify({ elapsedMs: now, rssBytes: process.memoryUsage().rss,
      heapBytes: process.memoryUsage().heapUsed,
      cpuCoresUsed: ((cpu.user - previousCpu.user) + (cpu.system - previousCpu.system)) / ((now - previousTime) * 1000),
      eventLoopUtilization: performance.eventLoopUtilization(loop, previousLoop).utilization,
    }) + '\n');
    previousCpu = cpu; previousTime = now; previousLoop = loop;
  }, 1000).unref();
  // A parent interruption must not leave a benchmark API running indefinitely.
  setTimeout(() => process.exit(2), 9 * 60_000).unref();
}
void main().catch(() => { console.error('Isolated benchmark API startup refused.'); process.exitCode = 1; });
