/**
 * Re-exports the canonical `stripCommentsTransform` from Core so both the lint and plugin
 * pipelines share the same implementation.
 */
import { Core } from "@gml-modules/core";

export type { StripCommentsTransformOptions } from "@gml-modules/core";

export const stripCommentsTransform = Core.stripCommentsTransform;

export default { stripCommentsTransform };
