import { describe, expect, it } from 'vitest';
import { studyStreak } from './study-goal-service';

describe('study streak calendar rules', () => {
  it('counts consecutive local days, unique active dates and the longest record', () => {
    expect(studyStreak(['2026-01-30', '2026-01-31', '2026-01-31', '2026-02-01'], '2026-02-01'))
      .toEqual({ current: 3, longest: 3, lastActivityDate: '2026-02-01' });
  });
  it('breaks the current streak after an inactive day and restarts on a later activity', () => {
    expect(studyStreak(['2026-03-01', '2026-03-02', '2026-03-04'], '2026-03-04').current).toBe(1);
    expect(studyStreak(['2026-03-01', '2026-03-02', '2026-03-04'], '2026-03-05').current).toBe(1);
  });
  it('handles month/year boundaries, today only, and no activity', () => {
    expect(studyStreak(['2025-12-31', '2026-01-01'], '2026-01-01')).toMatchObject({ current: 2, longest: 2 });
    expect(studyStreak(['2026-06-18'], '2026-06-18')).toMatchObject({ current: 1, longest: 1 });
    expect(studyStreak([], '2026-06-18')).toEqual({ current: 0, longest: 0, lastActivityDate: null });
  });
  it('treats activity as current through the immediately following local day', () => {
    expect(studyStreak(['2026-07-11'], '2026-07-12').current).toBe(1);
    expect(studyStreak(['2026-07-11'], '2026-07-13').current).toBe(0);
  });
});
