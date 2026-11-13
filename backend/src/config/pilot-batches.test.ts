import { afterEach, expect, it, vi } from 'vitest';
import { pilotBatchIds } from './pilot-batches';
const a='9218bdec-f4e3-43a1-8b54-cdc40720dea5', b='2318bdec-f4e3-43a1-8b54-cdc40720dea5';
afterEach(()=>vi.unstubAllEnvs());
it('keeps legacy activation and requires an explicit enabled flag',()=>{
  vi.stubEnv('QUESTION_PRACTICE_PILOT_BATCH_ID',a);
  vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED','false');
  expect(pilotBatchIds('QUESTION_PRACTICE')).toEqual([]);
  vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED','true');
  expect(pilotBatchIds('QUESTION_PRACTICE')).toEqual([a]);
});
it('deduplicates an explicit allowlist and keeps feature scopes independent',()=>{
  vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED','true');
  vi.stubEnv('QUESTION_PRACTICE_PILOT_BATCH_IDS',` ${a},${b},${a.toUpperCase()} `);
  expect(pilotBatchIds('QUESTION_PRACTICE')).toEqual([a,b]);
  expect(pilotBatchIds('INDIVIDUAL_EXAM')).toEqual([]);
});
it('refuses the entire malformed or oversized list without falling back to a legacy ID',()=>{
  vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED','true'); vi.stubEnv('QUESTION_PRACTICE_PILOT_BATCH_ID',a);
  for(const value of [`${a},invalid`,`${a},`,Array(11).fill(a).join(',')]){
    vi.stubEnv('QUESTION_PRACTICE_PILOT_BATCH_IDS',value);
    expect(pilotBatchIds('QUESTION_PRACTICE')).toEqual([]);
  }
});
