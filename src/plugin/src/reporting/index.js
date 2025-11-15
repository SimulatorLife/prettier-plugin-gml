// Public facade for reporting utilities used by the Prettier plugin.
//
// Keeping the exports centralized here allows external consumers (including
// sibling workspaces) to rely on a stable module path instead of importing
// files from the internal directory layout.
export { createMetricsTracker } from "@gml-modules/core";
