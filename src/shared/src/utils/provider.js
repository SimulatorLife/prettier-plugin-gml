import { assertFunction } from "./object.js";
import { assertNonEmptyString } from "./string.js";

/**
 * Ensure a provider function matches the shared contract used across
 * registries. Consolidating the guard keeps the bespoke error messages in sync
 * while returning the validated function reference for immediate reuse.
 *
 * @template {Function} TProvider
 * @param {TProvider | unknown} provider Candidate provider to validate.
 * @param {{
 *   context: string,
 *   expectation?: string,
 *   providerName?: string,
 *   includePeriod?: boolean
 * }} options
 * @returns {TProvider}
 */
export function assertProviderFunction(provider, options) {
    const {
        context,
        expectation,
        providerName = "provider",
        includePeriod = true
    } = options;

    const normalizedContext = assertNonEmptyString(context, {
        errorMessage:
            "Provider contexts must be described with non-empty strings."
    });

    let normalizedExpectation = "";
    if (expectation != null) {
        normalizedExpectation = assertNonEmptyString(expectation, {
            errorMessage:
                "Provider expectations must be described with non-empty strings."
        });
    }

    const requirement =
        normalizedExpectation === ""
            ? `${normalizedContext} must be functions`
            : `${normalizedContext} must be functions that ${normalizedExpectation}`;
    const message = includePeriod ? `${requirement}.` : requirement;

    return assertFunction(provider, providerName, { errorMessage: message });
}
