/**
 * Configuration for the assignment alignment feature.
 *
 * This module defines the default minimum group size for assignment alignment,
 * ensuring a single source of truth that can be referenced by both the option
 * definition and the alignment implementation without creating circular dependencies.
 */

/**
 * Default minimum number of consecutive simple assignments required before
 * the formatter aligns their '=' operators.
 *
 * This value is used as the default for the `alignAssignmentsMinGroupSize` option
 * and as a fallback when the option is not specified.
 */
export const DEFAULT_ALIGN_ASSIGNMENTS_MIN_GROUP_SIZE = 3;
