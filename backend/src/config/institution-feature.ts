// Activate only after the additive migration has been approved and applied.
// Disabled by default so existing shared databases continue to work unchanged.
import { restrictedOperationsEnabled } from './institution-homologation';
export const institutionsGloballyEnabled = () => process.env.INSTITUTIONS_ENABLED === 'true';
export const institutionsEnabled = () => institutionsGloballyEnabled() || restrictedOperationsEnabled();

// Explicit opt-ins; the original full module remains backward compatible.
export const administrationEnabled = () => institutionsGloballyEnabled() || process.env.ADMINISTRATION_ENABLED === 'true';
export const institutionRegistrationEnabled = () => institutionsGloballyEnabled() || process.env.INSTITUTION_REGISTRATION_ENABLED === 'true';
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
