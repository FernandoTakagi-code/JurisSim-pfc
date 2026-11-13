import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const db = vi.hoisted(() => ({
  administrativeEvent: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  institution: { findUnique: vi.fn() }, user: { findUnique: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));
import { InstitutionDecisionEmail, decisionEmailEvent, decisionEmailTransitionEvent } from './institution-decision-email';
import { EmailDeliveryFailure } from './email-delivery-failure';
const mail = { isConfigured: true, send: vi.fn() };
let root: { id: string; institutionId: string; actorId: string; event: string; result: string };
let transitions: { result: string }[];
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.invalid'); mail.isConfigured = true; mail.send.mockResolvedValue(undefined);
  transitions = [];
  root = { id: 'delivery-id', institutionId: 'institution-id', actorId: 'admin-id', event: decisionEmailEvent, result: JSON.stringify({ state: 'PENDING', status: 'REJECTED', reason: 'Revise <script>dados</script>', ownerId: 'owner-id' }) };
  let queue = Promise.resolve();
  db.$transaction.mockImplementation(async work => {
    const previous = queue; let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await work(db); } finally { release(); }
  });
  db.administrativeEvent.findUnique.mockImplementation(async () => ({ ...root }));
  db.administrativeEvent.findFirst.mockImplementation(async () => ({ ...root }));
  db.administrativeEvent.findMany.mockImplementation(async () => [...transitions]);
  db.administrativeEvent.create.mockImplementation(async ({ data }) => { if (data.event === decisionEmailTransitionEvent) transitions.push({ ...data }); return { id: 'transition-' + transitions.length, ...data }; });
  db.administrativeEvent.updateMany.mockRejectedValue(new Error('Administrative audit records are append-only'));
  db.institution.findUnique.mockResolvedValue({ name: 'Instituição <teste>', ownerId: 'owner-id', status: 'REJECTED', decisionReason: 'Revise <script>dados</script>' });
  db.user.findUnique.mockResolvedValue({ email: 'owner@example.invalid', emailVerifiedAt: new Date(), deletedAt: null });
});
afterEach(() => vi.unstubAllEnvs());
const status = () => new InstitutionDecisionEmail(mail).status(root.institutionId);
it('reserves once under concurrency, appends results and preserves the original audit byte for byte', async () => {
  const original = root.result, service = new InstitutionDecisionEmail(mail);
  await Promise.all(Array.from({ length: 8 }, () => service.deliver(root.id)));
  expect(mail.send).toHaveBeenCalledTimes(1);
  expect(await status()).toMatchObject({ state: 'SENT', attempts: 1, canRetry: false });
  expect(transitions.map(t => JSON.parse(t.result).state)).toEqual(['SENDING', 'SENT']);
  expect(root.result).toBe(original); expect(db.administrativeEvent.updateMany).not.toHaveBeenCalled();
  expect(db.$executeRaw).toHaveBeenCalled();
  await service.deliver(root.id); expect(mail.send).toHaveBeenCalledTimes(1);
});
it('records reservation before SMTP and exposes attempt timestamps', async () => {
  mail.send.mockImplementation(async () => { expect(await status()).toMatchObject({ state: 'SENDING', attempts: 1, canRetry: false }); });
  await new InstitutionDecisionEmail(mail).deliver(root.id);
  expect(await status()).toMatchObject({ lastAttemptAt: expect.any(String), startedAt: expect.any(String), finishedAt: expect.any(String) });
});
it('uses professional templates with escaped reason and confirmed recipient', async () => {
  await new InstitutionDecisionEmail(mail).deliver(root.id);
  expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.invalid', subject: expect.stringContaining('recusada'), html: expect.stringContaining('&lt;script&gt;dados&lt;/script&gt;') }));
  expect(mail.send.mock.calls[0][0].html).not.toContain('<script>');
});
it('recovers a legacy PENDING notification without changing its original event', async () => {
  const original = root.result;
  expect(await new InstitutionDecisionEmail(mail).retry(root.institutionId, root.id, 'reviewer-id')).toBe('SENT');
  expect(root.result).toBe(original);
  expect(db.administrativeEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'INSTITUTION_DECISION_EMAIL_RETRY_REQUESTED', actorId: 'reviewer-id', resourceId: root.id }) });
});
it('a connection failure is safely retryable, and concurrent manual retries send once', async () => {
  mail.send.mockRejectedValueOnce(new EmailDeliveryFailure('not_accepted', 'connect'));
  const service = new InstitutionDecisionEmail(mail);
  expect(await service.deliver(root.id)).toBe('FAILED');
  expect(await status()).toMatchObject({ state: 'FAILED', canRetry: true, lastError: { code: 'DELIVERY_NOT_ACCEPTED', stage: 'connect' } });
  await Promise.allSettled(Array.from({ length: 8 }, () => service.retry(root.institutionId, root.id, 'admin-id')));
  expect(mail.send).toHaveBeenCalledTimes(2);
  expect(await status()).toMatchObject({ state: 'SENT', attempts: 2, canRetry: false });
});
it('does not automatically retry a proven failure without explicit recovery', async () => {
  mail.send.mockRejectedValueOnce(new EmailDeliveryFailure('not_accepted', 'connect'));
  const service = new InstitutionDecisionEmail(mail); await service.deliver(root.id); await service.deliver(root.id);
  expect(mail.send).toHaveBeenCalledTimes(1);
});
it('an indeterminate SMTP outcome blocks every retry', async () => {
  mail.send.mockRejectedValue(new EmailDeliveryFailure('indeterminate', 'request_deadline'));
  const service = new InstitutionDecisionEmail(mail); expect(await service.deliver(root.id)).toBe('UNKNOWN');
  expect(await status()).toMatchObject({ state: 'UNKNOWN', canRetry: false });
  await expect(service.retry(root.institutionId, root.id, 'admin-id')).rejects.toMatchObject({ statusCode: 409 });
  await service.deliver(root.id); expect(mail.send).toHaveBeenCalledTimes(1);
});
it('never persists arbitrary SMTP error messages or credentials', async () => {
  mail.send.mockRejectedValue(new Error('private smtp password/token/connection string'));
  await new InstitutionDecisionEmail(mail).deliver(root.id);
  expect(JSON.stringify(transitions)).not.toContain('password');
  expect(await status()).toMatchObject({ lastError: { code: 'DELIVERY_INDETERMINATE', stage: 'unknown' } });
});
it('a failure to commit the reservation prevents SMTP', async () => {
  db.administrativeEvent.create.mockRejectedValue(new Error('isolated database failure'));
  await expect(new InstitutionDecisionEmail(mail).deliver(root.id)).rejects.toThrow('isolated database failure');
  expect(mail.send).not.toHaveBeenCalled(); expect(await status()).toMatchObject({ state: 'PENDING' });
});
it('accepted SMTP followed by failed final persistence leaves SENDING non-retryable', async () => {
  const create = db.administrativeEvent.create.getMockImplementation()!;
  db.administrativeEvent.create.mockImplementation(async args => { if (JSON.parse(args.data.result).state === 'SENT') throw new Error('isolated final persistence failure'); return create(args); });
  const service = new InstitutionDecisionEmail(mail); expect(await service.deliver(root.id)).toBe('UNKNOWN');
  expect(await status()).toMatchObject({ state: 'SENDING', canRetry: false });
  await expect(service.retry(root.institutionId, root.id, 'admin-id')).rejects.toMatchObject({ statusCode: 409 });
  expect(mail.send).toHaveBeenCalledTimes(1);
});
it.each(['provider', 'url'])('invalid %s appends a failure without SMTP', async kind => {
  if (kind === 'provider') mail.isConfigured = false; else vi.stubEnv('APP_PUBLIC_URL', 'not-a-url');
  expect(await new InstitutionDecisionEmail(mail).deliver(root.id)).toBe('FAILED');
  expect(mail.send).not.toHaveBeenCalled(); expect(await status()).toMatchObject({ canRetry: true, attempts: 1 });
});
it.each([{ status: 'PENDING' }, { ownerId: 'different-owner' }, { decisionReason: 'Changed decision' }])('cancels outdated snapshots: %o', async change => {
  db.institution.findUnique.mockResolvedValue({ name: 'Test', ownerId: 'owner-id', status: 'REJECTED', decisionReason: 'Revise <script>dados</script>', ...change });
  expect(await new InstitutionDecisionEmail(mail).deliver(root.id)).toBe('CANCELLED'); expect(mail.send).not.toHaveBeenCalled();
});
it.each([{ emailVerifiedAt: null }, { deletedAt: new Date() }])('unavailable owner cannot receive a decision: %o', async change => {
  db.user.findUnique.mockResolvedValue({ email: 'owner@example.invalid', emailVerifiedAt: new Date(), deletedAt: null, ...change });
  expect(await new InstitutionDecisionEmail(mail).deliver(root.id)).toBe('CANCELLED'); expect(mail.send).not.toHaveBeenCalled();
});
it('refuses manual recovery from another institution or a superseded decision', async () => {
  const service = new InstitutionDecisionEmail(mail);
  await expect(service.retry('foreign', root.id, 'admin-id')).rejects.toMatchObject({ statusCode: 403 });
  db.administrativeEvent.findFirst.mockResolvedValue({ id: 'newer-decision' });
  await expect(service.retry(root.institutionId, root.id, 'admin-id')).rejects.toMatchObject({ statusCode: 409 });
  expect(mail.send).not.toHaveBeenCalled();
});
it.each(['SENT', 'SENDING', 'UNKNOWN', 'CANCELLED'])('legacy %s root is never resent', async state => {
  root.result = JSON.stringify({ ...JSON.parse(root.result), state });
  expect(await new InstitutionDecisionEmail(mail).deliver(root.id)).toBe(state); expect(mail.send).not.toHaveBeenCalled();
});
it('a corrupt/ambiguous transition stream is indeterminate and never resent', async () => {
  transitions.push({ result: '{bad-json' });
  expect(await new InstitutionDecisionEmail(mail).deliver(root.id)).toBe('UNKNOWN'); expect(mail.send).not.toHaveBeenCalled();
});
