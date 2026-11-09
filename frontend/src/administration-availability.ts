export type AdministrativeCapability =
  | "overview"
  | "institutions"
  | "requests"
  | "decisions"
  | "users"
  | "teachers"
  | "classes"
  | "audit"
  | "notifications"
  | "classAssignment"
  | "institutionalOperations";
export type AdministrationAvailability = {
  enabled: boolean;
  registrationEnabled?: boolean;
  administrationEnabled?: boolean;
  capabilities?: Partial<Record<AdministrativeCapability, boolean>>;
};
export function administrativeCapability(
  data: AdministrationAvailability | undefined,
  capability: AdministrativeCapability,
) {
  return data?.capabilities?.[capability] ?? data?.enabled === true;
}
export function registrationAvailable(
  data: AdministrationAvailability | undefined,
) {
  return data?.registrationEnabled ?? data?.enabled === true;
}
