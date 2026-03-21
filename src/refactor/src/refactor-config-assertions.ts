import { Core } from "@gmloop/core";

/**
 * Assert that a config segment is a plain object and provide a context-aware error message.
 */
export function assertRefactorConfigPlainObject(value: unknown, context: string): Record<string, unknown> {
    return Core.assertPlainObject(value, {
        errorMessage: `${context} must be a plain object`
    });
}
