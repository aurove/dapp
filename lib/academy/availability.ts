/**
 * Single switch for the Academy product surface.
 *
 * Keep this default-off until Academy is ready to be exposed again. Setting
 * NEXT_PUBLIC_ACADEMY_ENABLED=true re-enables the existing UI, routes, docs,
 * and point-awarding integrations without restoring or rewriting them.
 */
export const ACADEMY_ENABLED =
  (process.env.NEXT_PUBLIC_ACADEMY_ENABLED ?? "false").trim().toLowerCase() === "true";

export const ACADEMY_DISABLED_MESSAGE = "Academy is currently unavailable.";
export const ACADEMY_DISABLED_CODE = "ACADEMY_DISABLED";
