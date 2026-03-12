/**
 * Entry point wiring the GameMaker Language formatter into Prettier.
 *
 * Centralizes the language, parser, printer, and option metadata exports so
 * consumers can register the formatter without reaching into internal modules.
 */

import prettier, { type SupportLanguage, type SupportOptions } from "prettier";

import { gmlFormatComponents } from "./components/format-components.js";
import type { GmlFormat, GmlFormatDefaultOptions } from "./components/format-types.js";
import { resolveCoreOptionOverrides } from "./options/core-option-overrides.js";
import { DEFAULT_PRINT_WIDTH, DEFAULT_TAB_WIDTH } from "./printer/constants.js";
import {
    ensureBlankLineBeforeTopLevelDecorativeBlockComments,
    ensureBlankLineBeforeTopLevelSlashOnlyBanners,
    normalizeFormattedOutput
} from "./printer/normalize-formatted-output.js";

export const parsers = gmlFormatComponents.parsers;
export const printers = gmlFormatComponents.printers;
export const formatOptions = gmlFormatComponents.options;

export const languages: SupportLanguage[] = [
    {
        name: "GameMaker Language",
        extensions: [".gml"],
        parsers: ["gml-parse"],
        vscodeLanguageIds: ["gml-gms2", "gml"]
    }
];

const BASE_PRETTIER_DEFAULTS: Record<string, unknown> = {
    tabWidth: DEFAULT_TAB_WIDTH,
    semi: true,
    printWidth: DEFAULT_PRINT_WIDTH,
    bracketSpacing: false, // Keep false to match existing GML formatting expectations.
    singleQuote: false
};

function extractOptionDefaults(optionConfigMap: SupportOptions): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(optionConfigMap)
            .filter(([, config]) => config && Object.hasOwn(config, "default"))
            .map(([name, config]) => [name, (config as { default?: unknown }).default])
    );
}

const coreOptionOverrides = resolveCoreOptionOverrides();
const formatOptionDefaults = extractOptionDefaults(formatOptions);

export const defaultOptions: GmlFormatDefaultOptions = Object.freeze({
    // Merge order:
    // GML Prettier defaults -> option defaults -> fixed overrides
    ...BASE_PRETTIER_DEFAULTS,
    ...formatOptionDefaults,
    ...coreOptionOverrides
});

/**
 * Utility function and entry point to format GML source code.
 *
 * This is a thin, deterministic wrapper around `prettier.format`. It must not
 * inspect or compare the original `source` text to patch the output — doing so
 * would make formatting non-deterministic and violate the formatter boundary
 * contract (target-state.md §3.2). Any blank-line policy, trailing-newline
 * insertion, or comment-spacing normalization belongs in the Prettier
 * printer/normalizer layer or in the linter workspace.
 *
 * After Prettier formats the document, two deterministic blank-line rules are
 * applied. Both replace the former `preserveBannerSpacingGaps` function, which
 * consulted the original source text to conditionally insert blank lines —
 * a source-aware approach that violated §3.2:
 *
 *  - `ensureBlankLineBeforeTopLevelDecorativeBlockComments` — inserts a blank
 *    line before top-level decorative block comment banners (those opening with
 *    a slash-asterisk pair followed by 20+ slashes, e.g. slash-star-slash×20).
 *  - `ensureBlankLineBeforeTopLevelSlashOnlyBanners` — inserts a blank line
 *    before top-level slash-only decorative lines (21+ consecutive forward
 *    slashes, no other content), such as camera-movement section separators.
 */
async function format(source: string, options: SupportOptions = {}) {
    const prettierFormatOptions: Record<string, unknown> = {
        ...options,
        parser: "gml-parse",
        plugins: [Format]
    };

    const formatted = await prettier.format(source, prettierFormatOptions);

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return ensureBlankLineBeforeTopLevelDecorativeBlockComments(
        ensureBlankLineBeforeTopLevelSlashOnlyBanners(formatted)
    );
}

export const Format: GmlFormat = {
    languages,
    parsers,
    printers,
    options: formatOptions,
    defaultOptions,
    format,
    normalizeFormattedOutput
};
export default Format;
