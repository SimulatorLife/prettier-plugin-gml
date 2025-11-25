// TODO: Remove this facade. Consumers should directly use Core.createMetricsTracker
import { Core } from "@gml-modules/core";

// Core exposes helpers on the flattened namespace; avoid nested `Core.Reporting`.
const createMetricsTracker = Core.createMetricsTracker;
export { createMetricsTracker };
