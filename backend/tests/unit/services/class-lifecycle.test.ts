import {beforeEach,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({$queryRaw:vi.fn()}));
vi.mock("../../../src/lib/prisma",()=>({prisma:db}));
beforeEach(()=>{vi.resetModules();vi.resetAllMocks();});
it('keeps existing class operations compatible when the lifecycle migration is absent',async()=>{
  db.$queryRaw.mockResolvedValue([{ready:false}]);
  const {classLifecycleReady,visibleClasses}=await import("../../../src/services/class-lifecycle");
  expect(await classLifecycleReady()).toBe(false);expect(await visibleClasses()).toEqual({});
});
it('filters tombstoned classes when lifecycle storage exists',async()=>{
  db.$queryRaw.mockResolvedValue([{ready:true}]);
  const {visibleClasses}=await import("../../../src/services/class-lifecycle");
  expect(await visibleClasses()).toEqual({OR:[{lifecycle:null},{lifecycle:{deletedAt:null}}]});
});
it('coalesces concurrent lifecycle schema probes instead of querying repeatedly',async()=>{
  db.$queryRaw.mockResolvedValue([{ready:true}]);
  const {classLifecycleReady}=await import("../../../src/services/class-lifecycle");
  expect(await Promise.all([classLifecycleReady(),classLifecycleReady(),classLifecycleReady()])).toEqual([true,true,true]);
  expect(db.$queryRaw).toHaveBeenCalledTimes(1);
});
it('does not treat connection failures as permission to omit deletion filtering',async()=>{
  db.$queryRaw.mockRejectedValue(new Error('connection unavailable'));
  const {visibleClasses}=await import("../../../src/services/class-lifecycle");
  await expect(visibleClasses()).rejects.toThrow('connection unavailable');
});
it('requires actual activity storage and preserves errors instead of falsely enabling publication',async()=>{
  db.$queryRaw.mockResolvedValue([{ready:false}]);
  const {classActivitiesReady}=await import("../../../src/services/class-lifecycle");
  expect(await classActivitiesReady()).toBe(false);
  vi.resetModules();db.$queryRaw.mockRejectedValue(new Error('database unavailable'));
  const next=await import("../../../src/services/class-lifecycle");await expect(next.classActivitiesReady()).rejects.toThrow('database unavailable');
});
