// Activate only after the additive migration has been approved and applied.
// Disabled by default so existing shared databases continue to work unchanged.
export const institutionsEnabled = () =>
  process.env.INSTITUTIONS_ENABLED === "true";

// Explicit opt-ins; the original full module remains backward compatible.
export const administrationEnabled = () => institutionsEnabled() || process.env.ADMINISTRATION_ENABLED === 'true';
export const institutionRegistrationEnabled = () => institutionsEnabled() || process.env.INSTITUTION_REGISTRATION_ENABLED === 'true';
export function administrativeCapabilities() {
  const full = institutionsEnabled(), administration = administrationEnabled(), registration = institutionRegistrationEnabled();
  return { enabled: full, registrationEnabled: registration, administrationEnabled: administration,
    capabilities: { overview: administration, institutions: administration || registration,
      requests: administration || registration, decisions: administration || registration,
      users: administration, teachers: administration, classes: false,
      audit: administration || registration, notifications: administration || registration,
      classAssignment: false, institutionalOperations: full },
  };
}
