import {afterEach, expect, it, vi} from 'vitest';
import {administrativeCapabilities} from './institution-feature';
afterEach(()=>vi.unstubAllEnvs());
for (const full of [false,true]) for (const admin of [false,true]) for (const registration of [false,true]) {
  it(`separates capabilities full=${full}, admin=${admin}, registration=${registration}`,()=>{
    vi.stubEnv('INSTITUTIONS_ENABLED',String(full));vi.stubEnv('ADMINISTRATION_ENABLED',String(admin));vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED',String(registration));vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','false');vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','false');
    const state=administrativeCapabilities();
    expect(state.enabled).toBe(full);
    expect(state.registrationEnabled).toBe(full||registration);
    expect(state.capabilities.users).toBe(full||admin);
    expect(state.capabilities.requests).toBe(full||admin||registration);
    expect(state.capabilities.classAssignment).toBe(full);
    expect(state.capabilities.examManagement).toBe(full);
    expect(state.capabilities.classes).toBe(false);
    expect(state.capabilities.institutionalOperations).toBe(full);
  });
}
it('does not enable any write scope by default',()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','');vi.stubEnv('ADMINISTRATION_ENABLED','');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','');
  vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','');vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','');
  expect(Object.values(administrativeCapabilities().capabilities).every(value=>!value)).toBe(true);
});
it('enables only teacher invitations and links without enabling global institutional operations',()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('ADMINISTRATION_ENABLED','false');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','true');
  const state=administrativeCapabilities();
  expect(state.enabled).toBe(false);
  expect(state.capabilities).toMatchObject({teacherManagement:true,teacherInvitations:true,classAssignment:true,examManagement:false,institutionalOperations:false,classes:false});
});
it('enables only institutional exams when their dedicated capability is enabled',()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','false');vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','true');
  const state=administrativeCapabilities();
  expect(state.enabled).toBe(false);
  expect(state.capabilities).toMatchObject({teacherManagement:false,examManagement:true,institutionalOperations:false});
});
