// Only the cluster created and validated by test-migrations-local.cjs is allowed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { prisma } from '../src/lib/prisma';
import { authRoutes } from '../src/routes/auth-routes';
import { profilePhotoRoutes } from '../src/routes/profile-photo-routes';
import { errorHandler } from '../src/middlewares/error-handler';
let server: Server | undefined, base: string, checks = 0;
const pass = (message: string) => { checks++; console.log(`PASS PHOTO DB: ${message}`); };
async function call(route: string, token?: string, method = 'GET', body?: string | Buffer, type = 'application/json', status = 200) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body });
  assert.equal(response.status, status, `${method} ${route}: expected ${status}, got ${response.status}`);
  assert.ok(!response.headers.get('cache-control') || response.headers.get('cache-control') === 'no-store');
  if (status === 404 && !response.headers.get('content-type')?.includes('application/json')) return {};
  return response.json();
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.username, 'jurissim_migration_test'); assert.equal(url.password, '');
  assert.equal(url.pathname, '/jurissim_fresh'); assert.ok(url.port && url.port !== '5432'); assert.equal(process.env.DIRECT_URL, url.toString());
  assert.equal(process.env.GMAIL_USER, ''); assert.equal(process.env.GMAIL_APP_PASSWORD, ''); assert.equal(process.env.GROQ_API_KEY, '');
  const expected = fs.realpathSync(process.argv[2] ?? '');
  assert.equal(path.dirname(path.dirname(expected)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase()); assert.ok(path.basename(path.dirname(expected)).startsWith('jurissim-migrations-'));
  const [cluster] = await prisma.$queryRaw<{ data_directory: string }[]>`SELECT current_setting('data_directory') AS data_directory`;
  assert.equal(fs.realpathSync(cluster.data_directory).toLowerCase(), expected.toLowerCase());
  const app = express(); app.use(express.json()); app.use('/auth', authRoutes); app.use('/profile/photo', profilePhotoRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const password = 'isolated-photo-fixture-password', hash = await bcrypt.hash(password, 4);
  const users: Record<string, { id: string; email: string; token: string }> = {};
  const login = async (email: string) => (await call('/auth/login', undefined, 'POST', JSON.stringify({ email, senha: password }))).token as string;
  for (const [key, role] of [['alice', 'ALUNO'], ['bob', 'ALUNO'], ['teacher', 'PROFESSOR'], ['pending', 'ALUNO']] as const) {
    const row = await prisma.user.create({ data: { nome: 'Photo fixture ' + key, email: `photo-${key}@example.invalid`, senhaHash: hash, role, emailVerifiedAt: key === 'pending' ? null : new Date() } });
    users[key] = { id: row.id, email: row.email, token: await login(row.email) };
  }
  const a = users.alice.token, b = users.bob.token, t = users.teacher.token;
  assert.deepEqual(await call('/profile/photo', a), { kind: 'default' });
  for (const token of [a, t]) assert.equal((await call('/profile/photo/avatar', token, 'PUT', '{"avatarId":"scholar-2"}')).avatarId, 'scholar-2');
  assert.deepEqual(await call('/profile/photo', b), { kind: 'default' });
  assert.equal(await prisma.profilePhoto.count({ where: { userId: users.alice.id } }), 1);
  pass('confirmed student and teacher persist own avatar; a different student remains unchanged');
  const [rls] = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE oid = '"ProfilePhoto"'::regclass`;
  assert.equal(rls.relrowsecurity, true);
  await prisma.$executeRawUnsafe('CREATE ROLE jurissim_photo_untrusted NOLOGIN');
  await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO jurissim_photo_untrusted');
  await prisma.$executeRawUnsafe('GRANT SELECT ON "ProfilePhoto" TO jurissim_photo_untrusted');
  const deniedCount = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE jurissim_photo_untrusted');
    const [row] = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "ProfilePhoto"`;
    return row.count;
  });
  assert.equal(deniedCount, 0n);
  pass('row security denies direct reads by an untrusted database role even with explicit SELECT grant');

  await call('/profile/photo/avatar', a, 'PUT', JSON.stringify({ avatarId: 'books', userId: users.bob.id }), undefined, 422);
  await call('/profile/photo?userId=' + users.bob.id, a, 'GET', undefined, undefined, 422);
  await call('/profile/photo/' + users.bob.id, a, 'DELETE', undefined, undefined, 404);
  await call('/profile/photo', undefined, 'GET', undefined, undefined, 401);
  await call('/profile/photo', users.pending.token, 'GET', undefined, undefined, 403);
  pass('identity cannot be overridden by body, query or path; anonymous and unconfirmed accounts are blocked');

  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#304070' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const photo = await call('/profile/photo/image', a, 'PUT', original, 'image/jpeg');
  assert.equal(photo.kind, 'image'); assert.match(photo.dataUrl, /^data:image\/webp;base64,/);
  const row = await prisma.profilePhoto.findUniqueOrThrow({ where: { userId: users.alice.id } });
  assert.equal(row.avatarId, null); assert.ok(row.image); assert.equal(row.image.length <= 262144, true);
  const meta = await sharp(row.image).metadata(); assert.equal(meta.format, 'webp'); assert.equal(meta.width, 512); assert.equal(meta.height, 512); assert.equal(meta.exif, undefined); assert.equal(meta.icc, undefined);
  assert.equal(photo.dataUrl, 'data:image/webp;base64,' + Buffer.from(row.image).toString('base64'));
  pass('real JPEG is decoded, rotated, resized, stripped of EXIF and stored as bounded private WebP bytes');

  await prisma.$disconnect(); const fresh = await login(users.alice.email);
  assert.deepEqual(await call('/profile/photo', fresh), photo);
  assert.deepEqual(await call('/profile/photo', b), { kind: 'default' });
  pass('database reconnect and official new login recover exact image without affecting other sessions');

  await call('/profile/photo/image', fresh, 'PUT', Buffer.from('<svg onload="evil"/>'), 'image/png', 415);
  await call('/profile/photo/image', fresh, 'PUT', Buffer.from([137,80,78,71,13,10,26,10]), 'image/png', 422);
  await call('/profile/photo/image', fresh, 'PUT', Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 413);
  assert.deepEqual(await call('/profile/photo', fresh), photo);
  await assert.rejects(() => prisma.$executeRaw`UPDATE "ProfilePhoto" SET image = ${Buffer.alloc(262145)} WHERE "userId" = ${users.alice.id}`);
  pass('malformed/spoofed/oversize uploads preserve previous image; database constraint enforces stored-byte limit');

  const replacement = await call('/profile/photo/avatar', fresh, 'PUT', '{"avatarId":"justice"}');
  assert.notEqual(replacement.version, photo.version); assert.equal(await prisma.profilePhoto.count({ where: { userId: users.alice.id } }), 1);
  assert.equal((await prisma.profilePhoto.findUniqueOrThrow({ where: { userId: users.alice.id } })).image, null);
  assert.deepEqual(await call('/profile/photo', fresh, 'DELETE'), { kind: 'default' });
  assert.deepEqual(await call('/profile/photo', fresh, 'DELETE'), { kind: 'default' });
  assert.equal(await prisma.profilePhoto.count({ where: { userId: users.alice.id } }), 0);
  pass('replacement discards old bytes and version; repeated removal is idempotent and returns initials');

  await call('/profile/photo/image', fresh, 'PUT', original, 'image/jpeg');
  await prisma.user.update({ where: { id: users.alice.id }, data: { sessionVersion: { increment: 1 } } });
  await call('/profile/photo', fresh, 'GET', undefined, undefined, 401);
  await call('/profile/photo/avatar', fresh, 'PUT', '{"avatarId":"books"}', undefined, 401);
  const expired = jwt.sign({ id: users.bob.id, role: 'ALUNO', sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: -1 });
  await call('/profile/photo', expired, 'GET', undefined, undefined, 401);
  assert.equal((await call('/profile/photo', t)).avatarId, 'scholar-2');
  pass('revoked and expired tokens cannot read or replace photos; other user sessions stay valid');

  const deleteToken = await login(users.alice.email);
  await call('/auth/conta', deleteToken, 'DELETE', JSON.stringify({ senhaAtual: password }));
  assert.equal(await prisma.profilePhoto.count({ where: { userId: users.alice.id } }), 0);
  await call('/profile/photo', deleteToken, 'GET', undefined, undefined, 401);
  await call('/profile/photo/image', deleteToken, 'PUT', original, 'image/jpeg', 401);
  const hardDelete = await prisma.user.create({ data: { nome: 'Cascade fixture', email: 'photo-cascade@example.invalid', role: 'ALUNO', profilePhotos: { create: { avatarId: 'books' } } } });
  await prisma.user.delete({ where: { id: hardDelete.id } });
  assert.equal(await prisma.profilePhoto.count({ where: { userId: hardDelete.id } }), 0);
  pass('official account anonymization atomically removes photo; hard deletion cascades and cannot recreate images with old token');
  const [uploadRace] = await Promise.all([
    fetch(base + '/profile/photo/image', { method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'image/jpeg' }, body: Uint8Array.from(original) }),
    call('/auth/conta', t, 'DELETE', JSON.stringify({ senhaAtual: password })),
  ]);
  assert.ok([200, 401].includes(uploadRace.status)); await uploadRace.text();
  assert.equal(await prisma.profilePhoto.count({ where: { userId: users.teacher.id } }), 0);
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: users.teacher.id } })).deletedAt);
  pass('concurrent photo replacement and account deletion leave no image bytes associated with the deleted account');
  console.log(`PostgreSQL photo integration: ${checks} scenarios passed.`);
}
main().catch(error => { console.error('Local photo integration failed:', error.message); process.exitCode = 1; }).finally(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); await prisma.$disconnect(); });
