// Activate only after the additive migration has been approved and applied.
// Disabled by default so existing shared databases continue to work unchanged.
export const institutionsEnabled = () =>
  process.env.INSTITUTIONS_ENABLED === "true";
