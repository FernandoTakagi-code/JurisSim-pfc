import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import type { Server } from 'node:http';
const mocks = vi.hoisted(() => ({ account: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock('../repositories/auth-repository', () => ({ AuthRepository: class { findByIdForAuth = mocks.account; } }));
vi.mock('../lib/prisma', () => ({ prisma: { profilePhoto: { findUnique: mocks.read, deleteMany: mocks.remove }, user: { update: mocks.write }, $transaction: mocks.transaction } }));
import { profilePhotoRoutes } from './profile-photo-routes';
import { normalizePhoto, MAX_PHOTO_BYTES } from '../services/profile-photo-service';
import { errorHandler } from '../middlewares/error-handler';
let server: Server, base: string, token: string;
const secret = 'profile-photo-unit-test-secret-over-32-chars';
const user = (role = 'ALUNO') => ({ id: 'owner', role, emailVerifiedAt: new Date(), deletedAt: null, sessionVersion: 0 });
const request = (method = 'GET', route = '', body?: string | Buffer, type = 'application/json', bearer: string | null = token) => fetch(base + '/profile/photo' + route, { method, headers: { 'Content-Type': type, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: Buffer.isBuffer(body) ? Uint8Array.from(body) : body });
beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  token = jwt.sign({ id: 'owner', role: 'ADMIN', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  const app = express(); app.use(express.json()); app.use('/profile/photo', profilePhotoRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { vi.clearAllMocks(); mocks.account.mockResolvedValue(user()); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue({ id: 'owner' }); mocks.remove.mockResolvedValue({ count: 1 }); mocks.lock.mockResolvedValue([{ id: 'owner' }]); mocks.transaction.mockImplementation(work => work({ $queryRaw: mocks.lock, user: { update: mocks.write } })); });
describe('private profile photo API', () => {
  it.each([['GET', ''], ['PUT', '/avatar'], ['PUT', '/image'], ['DELETE', '']])('authenticates before reading or processing %s %s', async (method, route) => {
    expect((await request(method, route, method === 'PUT' ? Buffer.from('not an image') : undefined, 'application/octet-stream', null)).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(['ALUNO', 'PROFESSOR', 'ADMIN'])('accepts a confirmed current %s', async role => {
    mocks.account.mockResolvedValue(user(role)); const response = await request(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ kind: 'default' });
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(mocks.read).toHaveBeenCalledWith({ where: { userId: 'owner' } });
  });
  it.each(['GET', 'PUT', 'DELETE'])('rejects unconfirmed identity for %s', async method => {
    mocks.account.mockResolvedValue({ ...user(), emailVerifiedAt: null }); expect((await request(method, method === 'PUT' ? '/avatar' : '', method === 'PUT' ? '{"avatarId":"books"}' : undefined)).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([null, { ...user(), deletedAt: new Date() }, { ...user(), sessionVersion: 1 }])('rejects absent/deleted/revoked identities', async account => {
    mocks.account.mockResolvedValue(account); expect((await request()).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects expired and tampered JWTs', async () => {
    for (const bearer of [jwt.sign({ id: 'owner', role: 'ALUNO' }, secret, { expiresIn: -10 }), 'invalid']) expect((await request('GET', '', undefined, undefined, bearer)).status).toBe(401);
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it.each([{ avatarId: '../other' }, { avatarId: 'https://example.invalid/avatar' }, { avatarId: 'books', userId: 'victim' }, { avatarId: 'books', image: 'forged' }, {}])('rejects forged avatar/path/owner', async body => {
    expect((await request('PUT', '/avatar', JSON.stringify(body))).status).toBe(422); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('only stores an allowed avatar for token owner', async () => {
    expect((await request('PUT', '/avatar', '{"avatarId":"books"}')).status).toBe(200);
    const args = mocks.write.mock.calls[0][0]; expect(args.where).toEqual({ id: 'owner' }); expect(mocks.lock).toHaveBeenCalled();
    expect(args.data.profilePhotos.upsert.create).toMatchObject({ avatarId: 'books', image: null }); expect(args.data.profilePhotos.upsert.update.version).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('rechecks deletion/confirmation under lock after decoding and before writing', async () => {
    mocks.lock.mockResolvedValue([]); expect((await request('PUT', '/avatar', '{"avatarId":"books"}')).status).toBe(401); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('reads only own image with normalized MIME and no database fields', async () => {
    mocks.read.mockResolvedValue({ userId: 'owner', image: Buffer.from('test'), avatarId: null, version: 'random', updatedAt: new Date() });
    expect(await (await request()).json()).toEqual({ kind: 'image', dataUrl: 'data:image/webp;base64,dGVzdA==', version: 'random' });
  });
  it.each(['?userId=victim', '?path=../image', '/victim'])('does not expose another owner via %s', async route => {
    expect((await request('GET', route)).status).toBe(route.startsWith('?') ? 422 : 404); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('removes only own record, idempotently, and rejects ownership fields', async () => {
    expect((await request('DELETE', '', '{"userId":"victim"}')).status).toBe(422);
    expect(await (await request('DELETE')).json()).toEqual({ kind: 'default' }); expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ where: { userId: 'owner' } });
  });
  it.each(['image/svg+xml', 'text/html', 'application/json', 'multipart/form-data'])('rejects disallowed transport %s', async mime => {
    expect((await request('PUT', '/image', mime === 'application/json' ? '{}' : '<svg/>', mime)).status).toBe(415); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('rejects an upload over 5 MB before decoding', async () => {
    expect((await request('PUT', '/image', Buffer.alloc(MAX_PHOTO_BYTES + 1), 'image/png')).status).toBe(413); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('validates true type despite a forged allowed MIME', async () => {
    expect((await request('PUT', '/image', Buffer.from('<svg onload="evil()"/>'), 'image/jpeg')).status).toBe(415); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('reprocesses a real upload rather than persisting original bytes', async () => {
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fa1020' } }).png().toBuffer();
    expect((await request('PUT', '/image', png, 'application/octet-stream')).status).toBe(200);
    const image = mocks.write.mock.calls[0][0].data.profilePhotos.upsert.create.image;
    const meta = await sharp(image).metadata(); expect(meta.format).toBe('webp'); expect(meta.width).toBe(512); expect(meta.height).toBe(512); expect(meta.exif).toBeUndefined();
  });
});
describe('image normalization with actual decoder', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('decodes and normalizes %s, strips EXIF and trailing content', async format => {
    const image = await sharp({ create: { width: 650, height: 700, channels: 3, background: '#224455' } }).withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    const output = await normalizePhoto(Buffer.concat([image, Buffer.from('private-trailing-script')]));
    const meta = await sharp(output).metadata(); expect(meta.format).toBe('webp'); expect(meta.width).toBe(512); expect(meta.height).toBe(512);
    expect(meta.exif).toBeUndefined(); expect(meta.icc).toBeUndefined(); expect(meta.orientation).toBeUndefined(); expect(output.includes(Buffer.from('private-trailing-script'))).toBe(false);
  });
  it.each([Buffer.alloc(0), Buffer.from('MZ executable'), Buffer.from('GIF89a animation'), Buffer.from('<svg/>'), Buffer.from([137,80,78,71,13,10,26,10])])('rejects empty, executable, GIF, SVG and truncated PNG', async input => {
    await expect(normalizePhoto(input)).rejects.toMatchObject({ statusCode: expect.any(Number) });
  });
  it('rejects highly compressed oversized pixel dimensions', async () => {
    const png = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect(png.length).toBeLessThan(MAX_PHOTO_BYTES); await expect(normalizePhoto(png)).rejects.toMatchObject({ statusCode: 422 });
  });
  it('enforces byte limit independently of HTTP parser', async () => { await expect(normalizePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1))).rejects.toMatchObject({ statusCode: 413 }); });
});
