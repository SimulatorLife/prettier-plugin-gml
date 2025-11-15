// Public facade for reporting utilities used by the Prettier plugin.
//
// Keeping the exports centralized here allows external consumers (including
// sibling workspaces) to rely on a stable module path instead of importing
// files from the internal directory layout.
import { Core } from "@gml-modules/core";
const { createMetricsTracker } = Core;
export { createMetricsTracker };

