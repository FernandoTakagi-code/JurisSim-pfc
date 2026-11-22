import { describe, expect, it } from 'vitest';
import { DEMO_EMAIL_DOMAIN, DEMO_PREFIX, planDemoData } from '../../../src/services/demo/demo-data';

const now = new Date('2026-11-22T15:00:00Z');
const plan = planDemoData({ students: 2000, teachers: 40, months: 6, now, seed: 42 });

describe('planDemoData', () => {
  it('cria a quantidade pedida de contas, todas identificáveis como demonstração', () => {
    expect(plan.users).toHaveLength(2040);
    expect(plan.users.filter(u => u.role === 'ALUNO')).toHaveLength(2000);
    expect(plan.users.filter(u => u.role === 'PROFESSOR')).toHaveLength(40);
    for (const u of plan.users) {
      expect(u.email.endsWith(DEMO_EMAIL_DOMAIN)).toBe(true);
      expect(u.nome.startsWith(DEMO_PREFIX)).toBe(false); // nomes legíveis; a marca fica no e-mail
    }
    expect(new Set(plan.users.map(u => u.email)).size).toBe(2040);
  });

  it('espalha os cadastros pelos últimos meses, sem datas no futuro, com mais cadastros recentes', () => {
    const start = new Date('2026-05-22T15:00:00Z').getTime();
    for (const u of plan.users) {
      expect(u.createdAt.getTime()).toBeGreaterThanOrEqual(start - 86400_000);
      expect(u.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
    const months = new Set(plan.users.map(u => u.createdAt.toISOString().slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(6);
    const recent = plan.users.filter(u => u.createdAt.getTime() > now.getTime() - 30 * 86400_000).length;
    const oldest = plan.users.filter(u => u.createdAt.getTime() < start + 30 * 86400_000).length;
    expect(recent).toBeGreaterThan(oldest);
  });

  it('monta turmas e avaliações marcadas como demonstração', () => {
    expect(plan.classes).toHaveLength(3);
    for (const c of plan.classes) {
      expect(c.nome.startsWith(DEMO_PREFIX)).toBe(true);
      expect(c.exams).toHaveLength(3);
      for (const e of c.exams) expect(e.titulo.startsWith(DEMO_PREFIX)).toBe(true);
    }
  });

  it('matricula cerca de metade dos alunos e cada tentativa acontece depois do cadastro e da publicação', () => {
    const enrolled = new Set(plan.classes.flatMap(c => c.studentEmails));
    expect(enrolled.size).toBeGreaterThan(800);
    expect(enrolled.size).toBeLessThan(1200);
    const byEmail = new Map(plan.users.map(u => [u.email, u]));
    const attempts = plan.classes.flatMap(c => c.exams.flatMap(e => e.attempts.map(a => ({ ...a, publishedAt: e.publishedAt, classEmails: c.studentEmails }))));
    expect(attempts.length).toBeGreaterThan(1000);
    for (const a of attempts) {
      expect(a.classEmails).toContain(a.studentEmail);
      expect(a.finishedAt.getTime()).toBeGreaterThanOrEqual(a.publishedAt.getTime());
      expect(a.finishedAt.getTime()).toBeGreaterThanOrEqual(byEmail.get(a.studentEmail)!.createdAt.getTime());
      expect(a.finishedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(a.correct.length).toBe(5);
    }
    const keys = attempts.map(a => a.studentEmail + '|' + a.examKey);
    expect(new Set(keys).size).toBe(keys.length); // uma tentativa por aluno e avaliação
  });

  it('é determinístico para a mesma semente', () => {
    const again = planDemoData({ students: 2000, teachers: 40, months: 6, now, seed: 42 });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });

  it('recusa quantidades fora do limite', () => {
    expect(() => planDemoData({ students: 0, teachers: 0, months: 6, now, seed: 1 })).toThrow();
    expect(() => planDemoData({ students: 20001, teachers: 0, months: 6, now, seed: 1 })).toThrow();
  });
});
