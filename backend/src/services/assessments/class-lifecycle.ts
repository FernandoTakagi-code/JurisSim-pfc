import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

let cached: { ready: boolean; until: number } | undefined;
let pending: Promise<boolean> | undefined;
export async function classLifecycleReady(): Promise<boolean> {
  if (cached && cached.until > Date.now()) return cached.ready;
  // Some existing unit doubles implement only the persistence calls under test.
  if (typeof prisma.$queryRaw !== "function") return false;
  if (!pending)
    pending = Promise.resolve(
      prisma.$queryRaw<
        { ready: boolean }[]
      >`SELECT to_regclass('public."ClassLifecycle"') IS NOT NULL AS ready`,
    )
      .then((rows) => {
        const ready = rows?.[0]?.ready === true;
        cached = { ready, until: Date.now() + 5000 };
        return ready;
      })
      .finally(() => {
        pending = undefined;
      });
  return pending;
}
export async function visibleClasses(): Promise<Prisma.TurmaWhereInput> {
  return (await classLifecycleReady())
    ? { OR: [{ lifecycle: null }, { lifecycle: { deletedAt: null } }] }
    : {};
}

let activityCache: { ready: boolean; until: number } | undefined;
export async function classActivitiesReady(): Promise<boolean> {
  if (activityCache && activityCache.until > Date.now())
    return activityCache.ready;
  if (typeof prisma.$queryRaw !== "function") return false;
  const rows = await prisma.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass('public."ClassActivity"') IS NOT NULL AS ready`;
  const ready = rows?.[0]?.ready === true;
  activityCache = { ready, until: Date.now() + 5000 };
  return ready;
}

let examCache:{ready:boolean;until:number}|undefined;
export async function examSettingsReady():Promise<boolean>{
  if(examCache&&examCache.until>Date.now())return examCache.ready;
  if(typeof prisma.$queryRaw!=='function')return false;
  const rows=await prisma.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('public."ClassExamSettings"') IS NOT NULL AS ready`;
  const ready=rows?.[0]?.ready===true;examCache={ready,until:Date.now()+5000};return ready;
}
