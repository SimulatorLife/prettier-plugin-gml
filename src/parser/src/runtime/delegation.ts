/**
 * Delegation pattern utilities.
 *
 * This module provides utilities for implementing the delegation pattern in
 * visitor and listener wrappers. Delegates allow flexible customization of
 * parse tree traversal behavior.
 *
 * @module parser/runtime/delegation
 */

import { Core } from "@gml-modules/core";

/**
 * Safely converts a value to a delegate function, providing a fallback if needed.
 *
 * @param value - The value to convert to a delegate
 * @param fallback - Default delegate to use if value is not a function
 * @returns Either the validated function value or the fallback
 *
 * @remarks
 * This ensures that delegate parameters are always callable functions, preventing
 * runtime errors from invalid delegate values.
 */
export function toDelegate<T extends (...args: unknown[]) => unknown>(value: unknown, fallback: T = Core.noop as T): T {
    return typeof value === "function" ? (value as T) : fallback;
}
