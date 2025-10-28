import { parseHTML } from "linkedom";

import { Command } from "commander";

import {
    createVerboseDurationLogger,
    escapeRegExp,
    getNonEmptyTrimmedString,
    isNonEmptyArray,
    isNonEmptyString,
    resolveCommandUsage,
    timeSync,
    toNormalizedLowerCaseSet
} from "../shared/dependencies.js";
import { assertSupportedNodeVersion } from "../shared/node-version.js";
import { disposeProgressBars } from "../runtime-options/progress-bar.js";
import { writeManualJsonArtifact } from "../modules/manual/file-helpers.js";
import {
    MANUAL_CACHE_ROOT_ENV_VAR,
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    announceManualDownloadStart,
    buildManualRepositoryEndpoints,
    downloadManualEntriesWithProgress,
    ensureManualRefHasSha
} from "../modules/manual/utils.js";
import {
    MANUAL_REF_ENV_VAR,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyManualEnvOptionOverrides
} from "../modules/manual/environment.js";
import { applyStandardCommandOptions } from "../core/command-standard-options.js";
import {
    applySharedManualCommandOptions,
    resolveManualCommandOptions
} from "../modules/manual/command-options.js";
import {
    createManualFileAccessContext,
    createManualReferenceAccessContext
} from "../modules/manual/context.js";

/** @typedef {ReturnType<typeof resolveManualCommandOptions>} ManualCommandOptions */

const ENVIRONMENT_VARIABLE_HELP_ENTRIES = [
    [MANUAL_REPO_ENV_VAR, "Override the manual repository (owner/name)."],
    [
        MANUAL_CACHE_ROOT_ENV_VAR,
        "Override the cache directory for manual artefacts."
    ],
    [
        MANUAL_REF_ENV_VAR,
        "Set the default manual ref (tag, branch, or commit)."
    ],
    [PROGRESS_BAR_WIDTH_ENV_VAR, "Override the progress bar width."]
];

function formatEnvironmentVariableHelp(entries) {
    const labelWidth = entries.reduce(
        (max, [name]) => Math.max(max, name.length),
        0
    );

    return entries.map(([name, description]) => {
        const paddedName = name.padEnd(labelWidth);
        return `  ${paddedName}  ${description}`;
    });
}

const {
    environment: {
        repoRoot: REPO_ROOT,
        defaultCacheRoot: DEFAULT_CACHE_ROOT,
        defaultOutputPath: OUTPUT_DEFAULT
    },
    fetchManualFile
} = createManualFileAccessContext({
    importMetaUrl: import.meta.url,
    userAgent: "prettier-plugin-gml feather metadata generator",
    outputFileName: "feather-metadata.json"
});

const { resolveManualRef } = createManualReferenceAccessContext({
    importMetaUrl: import.meta.url,
    userAgent: "prettier-plugin-gml feather metadata generator"
});

const FEATHER_PAGES = {
    diagnostics:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Messages.htm",
    directives:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Directives.htm",
    naming: "Manual/contents/Setting_Up_And_Version_Information/IDE_Preferences/Feather_Settings.htm",
    typeSystem:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Data_Types.htm"
};

/**
 * Create the CLI command for generating Feather metadata.
 *
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 * @returns {import("commander").Command}
 */
export function createFeatherMetadataCommand({ env = process.env } = {}) {
    const command = applyStandardCommandOptions(
        new Command()
            .name("generate-feather-metadata")
            .usage("[options]")
            .description(
                "Generate feather-metadata.json from the GameMaker manual."
            )
    ).option("-r, --ref <git-ref>", "Manual git ref (tag, branch, or commit).");

    applySharedManualCommandOptions(command, {
        outputPath: { defaultValue: OUTPUT_DEFAULT },
        cacheRoot: { defaultValue: DEFAULT_CACHE_ROOT },
        manualRepo: { defaultValue: DEFAULT_MANUAL_REPO },
        quietDescription: "Suppress progress output (useful in CI)."
    });

    const environmentVariableHelp = formatEnvironmentVariableHelp(
        ENVIRONMENT_VARIABLE_HELP_ENTRIES
    );

    command.addHelpText(
        "after",
        ["", "Environment variables:", ...environmentVariableHelp].join("\n")
    );

    applyManualEnvOptionOverrides({
        command,
        env,
        getUsage: resolveCommandUsage(command)
    });

    return command;
}

/**
 * Resolve normalized CLI options for the Feather metadata command.
 *
 * @param {import("commander").Command} command
 * @returns {ManualCommandOptions}
 */
function resolveFeatherMetadataOptions(command) {
    return resolveManualCommandOptions(command, {
        defaults: {
            ref: null,
            outputPath: OUTPUT_DEFAULT,
            cacheRoot: DEFAULT_CACHE_ROOT,
            manualRepo: DEFAULT_MANUAL_REPO
        }
    });
}

// Manual fetching helpers are wired via the shared manual command context.

function normalizeMultilineText(text) {
    if (!isNonEmptyString(text)) {
        return null;
    }

    const normalizedLines = [];
    let previousHadContent = false;

    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        const hasContent = line.length > 0;

        if (hasContent) {
            normalizedLines.push(line);
        } else if (previousHadContent) {
            normalizedLines.push("");
        }

        previousHadContent = hasContent;
    }

    return normalizedLines.join("\n").trim();
}

function sanitizeManualString(value) {
    if (typeof value !== "string") {
        return null;
    }

    return normalizeMultilineText(value);
}

function normalizeMultilineTextCollection(
    values,
    { preserveEmptyEntries = false, emptyEntryValue = null } = {}
) {
    if (!Array.isArray(values)) {
        return [];
    }

    const normalized = [];

    for (const value of values) {
        const text = normalizeMultilineText(value);

        if (text) {
            normalized.push(text);
        } else if (preserveEmptyEntries) {
            normalized.push(emptyEntryValue);
        }
    }

    return normalized;
}

function getNormalizedTextContent(element, { trim = false } = {}) {
    if (!element) {
        return trim ? null : "";
    }

    const { textContent } = element;
    if (!isNonEmptyString(textContent)) {
        return trim ? null : "";
    }

    const normalized = textContent.replaceAll("\u00A0", " ");
    if (!trim) {
        return normalized;
    }

    return getNonEmptyTrimmedString(normalized);
}

function parseDocument(html) {
    return parseHTML(html).document;
}

function isElement(node) {
    return node?.nodeType === node?.ownerDocument?.ELEMENT_NODE;
}

function getTagName(element) {
    return element?.tagName?.toLowerCase() ?? "";
}

function getDirectChildren(element, selector) {
    const predicate = selector
        ? (child) => child.matches?.(selector) === true
        : () => true;
    return Array.from(element?.children ?? []).filter(predicate);
}

function replaceBreaksWithNewlines(clone) {
    const document = clone.ownerDocument;
    for (const br of clone.querySelectorAll("br")) {
        const textNode = document.createTextNode("\n");
        br.parentNode?.replaceChild(textNode, br);
    }
}

function splitCellLines(element) {
    if (!element) {
        return [];
    }

    const clone = element.cloneNode(true);
    replaceBreaksWithNewlines(clone);

    return (
        clone.textContent
            ?.replaceAll("\u00A0", " ")
            .split("\n")
            .map((line) => line.replaceAll(/\s+/g, " ").trim())
            .filter(Boolean) ?? []
    );
}

function extractTable(table) {
    const headers = [];
    const rows = [];
    const rowElements = Array.from(table.querySelectorAll("tr"));

    rowElements.forEach((row, rowIndex) => {
        const cellElements = getDirectChildren(row, "th, td");
        const values = cellElements.map((cell) => {
            const lines = splitCellLines(cell);
            if (lines.length === 0) {
                return null;
            }
            return lines.join("\n");
        });

        const hasContent = values.some((value) =>
            getNonEmptyTrimmedString(value)
        );
        if (!hasContent) {
            return;
        }

        const hasHeaderCells = cellElements.some(
            (cell) => getTagName(cell) === "th"
        );
        if (rowIndex === 0 && hasHeaderCells) {
            headers.push(...normalizeMultilineTextCollection(values));
            return;
        }

        rows.push(
            normalizeMultilineTextCollection(values, {
                preserveEmptyEntries: true
            })
        );
    });

    return { headers, rows };
}

function createBlock(node) {
    if (!isElement(node)) {
        return null;
    }

    const element = node;
    const classList = element.classList ?? { contains: () => false };
    if (classList.contains("footer") || classList.contains("seealso")) {
        return null;
    }

    const tagName = getTagName(element);
    let type = "html";
    switch (tagName) {
        case "p": {
            if (classList.contains("code")) {
                type = "code";
            } else if (
                classList.contains("note") ||
                classList.contains("warning")
            ) {
                type = "note";
            } else {
                type = "paragraph";
            }

            break;
        }
        case "h4":
        case "h5": {
            type = "heading";

            break;
        }
        case "ul":
        case "ol": {
            type = "list";

            break;
        }
        case "table": {
            type = "table";

            break;
        }
        default: {
            if (tagName === "div" && classList.contains("codeblock")) {
                type = "code";
            }
        }
    }

    const preserveLineBreaks = type === "code" || type === "list";
    const text = extractText(element, { preserveLineBreaks });

    if (!text && type !== "list") {
        return null;
    }

    const block = { type, text };
    if (tagName === "h4" || tagName === "h5") {
        block.level = Number(tagName.slice(1));
    }
    if (type === "list") {
        const items = getDirectChildren(element, "li").map((item) =>
            extractText(item, { preserveLineBreaks: false })
        );
        block.items = items.filter(Boolean);
        if (block.items.length === 0 && !text) {
            return null;
        }
    }
    if (type === "table") {
        block.table = extractTable(element);
    }
    return block;
}

function extractText(element, { preserveLineBreaks = false } = {}) {
    if (!element) {
        return "";
    }

    const clone = element.cloneNode(true);
    replaceBreaksWithNewlines(clone);

    let text = getNormalizedTextContent(clone);
    if (preserveLineBreaks) {
        return text
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n")
            .trim();
    }

    return text.replaceAll(/\s+/g, " ").trim();
}

function extractSanitizedText(element, { preserveLineBreaks = false } = {}) {
    const text = extractText(element, { preserveLineBreaks });
    return sanitizeManualString(text) ?? null;
}

function collectBlocksAfter(element, { stopTags = [] } = {}) {
    const stopSet = toNormalizedLowerCaseSet(stopTags);
    const blocks = [];
    let node = element?.nextSibling;
    while (node) {
        if (isElement(node)) {
            const tagName = getTagName(node);
            if (stopSet.has(tagName)) {
                break;
            }
            if (tagName === "div" && node.classList?.contains("footer")) {
                break;
            }
            const block = createBlock(node);
            if (block) {
                blocks.push(block);
            }
        }
        node = node.nextSibling;
    }
    return blocks;
}

function normalizeTextBlock(block) {
    if (!block) {
        return null;
    }
    if (
        block.type === "list" &&
        Array.isArray(block.items) &&
        block.items.length > 0
    ) {
        return getNonEmptyTrimmedString(block.items.join("\n"));
    }
    return getNonEmptyTrimmedString(block.text);
}

function pushNormalizedText(target, value) {
    const normalized = normalizeMultilineText(value);
    if (normalized) {
        target.push(normalized);
    }
}

function normalizeListItems(items) {
    return normalizeMultilineTextCollection(items);
}

function collectNamingRuleSectionOptions(listItem) {
    const nestedList = listItem.querySelector("ul");
    if (!nestedList) {
        return [];
    }

    return getDirectChildren(nestedList, "li")
        .map((option) =>
            normalizeMultilineText(
                extractText(option, { preserveLineBreaks: false })
            )
        )
        .filter(Boolean);
}

function createNamingRuleSection(listItem) {
    const strongChildren = getDirectChildren(listItem, "strong");
    const title = getNormalizedTextContent(strongChildren[0], { trim: true });
    const description = extractText(listItem, { preserveLineBreaks: true });
    let normalizedDescription = normalizeMultilineText(description);

    if (title && normalizedDescription) {
        const prefixPattern = new RegExp(
            String.raw`^${escapeRegExp(title)}\s*:?\s*`,
            "i"
        );
        normalizedDescription = normalizedDescription
            .replace(prefixPattern, "")
            .trim();
    }

    return {
        title,
        description: normalizedDescription,
        options: collectNamingRuleSectionOptions(listItem)
    };
}

function updateNamingListMetadataFromStrongElement(strongEl, metadata) {
    const strongText = getNormalizedTextContent(strongEl, { trim: true });
    if (!strongText) {
        return;
    }

    const listItem = strongEl.closest("li");
    if (!listItem) {
        return;
    }

    if (strongText === "Naming Style") {
        metadata.namingStyleOptions = Array.from(
            listItem.querySelectorAll("ul li")
        )
            .map((styleEl) =>
                extractSanitizedText(styleEl, {
                    preserveLineBreaks: false
                })
            )
            .filter(Boolean);
    } else if (strongText === "Identifier Blocklist") {
        metadata.identifierBlocklist = extractSanitizedText(listItem, {
            preserveLineBreaks: true
        });
    } else if (strongText.endsWith("Naming Rule")) {
        metadata.identifierRuleSummary = extractSanitizedText(listItem, {
            preserveLineBreaks: true
        });
    } else if (strongText === "Prefix") {
        metadata.supportsPrefix = true;
    } else if (strongText === "Suffix") {
        metadata.supportsSuffix = true;
    } else if (strongText.toLowerCase().includes("preserve")) {
        metadata.supportsPreserveUnderscores = true;
    }
}

function collectNamingListMetadata(mainList) {
    const metadata = {
        namingStyleOptions: [],
        identifierBlocklist: null,
        identifierRuleSummary: null,
        supportsPrefix: false,
        supportsSuffix: false,
        supportsPreserveUnderscores: false,
        ruleSections: []
    };

    if (!mainList) {
        return metadata;
    }

    for (const strongEl of mainList.querySelectorAll("li > strong")) {
        updateNamingListMetadataFromStrongElement(strongEl, metadata);
    }

    metadata.ruleSections = getDirectChildren(mainList, "li").map((item) =>
        createNamingRuleSection(item)
    );

    return metadata;
}

const BLOCK_NORMALIZERS = {
    code(content, block) {
        if (block.text) {
            content.codeExamples.push(block.text);
        }
    },
    note(content, block) {
        pushNormalizedText(content.notes, block.text);
    },
    list(content, block) {
        const items = normalizeListItems(block.items);
        if (items.length > 0) {
            content.lists.push(items);
        }
    },
    table(content, block) {
        if (block.table) {
            content.tables.push(block.table);
        }
    },
    heading(content, block) {
        pushNormalizedText(content.headings, block.text);
    },
    default(content, block) {
        pushNormalizedText(content.paragraphs, block.text);
    }
};

function normalizeContent(blocks) {
    const content = {
        paragraphs: [],
        notes: [],
        codeExamples: [],
        lists: [],
        headings: [],
        tables: []
    };

    for (const block of blocks) {
        if (!block) {
            continue;
        }

        const normalizeBlock =
            BLOCK_NORMALIZERS[block.type] ?? BLOCK_NORMALIZERS.default;
        normalizeBlock(content, block);
    }

    return content;
}

function joinSections(parts) {
    if (!isNonEmptyArray(parts)) {
        return null;
    }

    const normalizedParts = parts
        .map((part) => getNonEmptyTrimmedString(part))
        .filter(Boolean);

    if (!isNonEmptyArray(normalizedParts)) {
        return null;
    }

    return normalizedParts.join("\n\n");
}

function slugify(text) {
    return text
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-+|-+$/g, "")
        .slice(0, 64);
}

// Split the collected manual blocks into descriptive and trailing sections.
function splitDiagnosticBlocks(blocks) {
    const exampleHeadingIndex = blocks.findIndex(
        (block) => block.type === "heading" && /example/i.test(block.text ?? "")
    );
    const firstCodeIndex = blocks.findIndex((block) => block.type === "code");

    let trailingStart = blocks.length;
    if (exampleHeadingIndex !== -1) {
        trailingStart = exampleHeadingIndex + 1;
    } else if (firstCodeIndex !== -1) {
        trailingStart = firstCodeIndex;
    }

    return {
        descriptionBlocks: blocks.slice(0, trailingStart),
        trailingBlocks: blocks.slice(trailingStart)
    };
}

// Extract paragraph-style content from the initial diagnostic blocks.
function collectDiagnosticDescriptionParts(blocks) {
    const descriptionParts = [];
    for (const block of blocks) {
        if (block.type === "heading") {
            continue;
        }
        const text = normalizeTextBlock(block);
        if (text) {
            descriptionParts.push(text);
        }
    }
    return descriptionParts;
}

// Analyse trailing blocks to determine examples and correction guidance.
function collectDiagnosticTrailingContent(blocks) {
    const additionalDescriptionParts = [];
    const correctionParts = [];
    const goodExampleParts = [];
    let badExample = null;

    for (const block of blocks) {
        if (!block || block.type === "heading") {
            continue;
        }

        const text = normalizeTextBlock(block);
        if (!text) {
            continue;
        }

        if (block.type !== "code") {
            const targetParts = badExample
                ? correctionParts
                : additionalDescriptionParts;
            targetParts.push(text);
            continue;
        }

        if (!badExample) {
            badExample = text;
            continue;
        }

        goodExampleParts.push(text);
    }

    const goodExample = joinSections(goodExampleParts);

    return {
        additionalDescriptionParts,
        correctionParts,
        badExample,
        goodExample
    };
}

// Convert the raw manual blocks into structured diagnostic metadata.
function summariseDiagnosticBlocks(blocks) {
    const { descriptionBlocks, trailingBlocks } = splitDiagnosticBlocks(blocks);
    const descriptionParts =
        collectDiagnosticDescriptionParts(descriptionBlocks);
    const {
        additionalDescriptionParts,
        correctionParts,
        badExample,
        goodExample
    } = collectDiagnosticTrailingContent(trailingBlocks);

    if (additionalDescriptionParts.length > 0) {
        descriptionParts.push(...additionalDescriptionParts);
    }

    return {
        descriptionParts,
        correctionParts,
        badExample,
        goodExample
    };
}

/**
 * Build structured diagnostic metadata from a manual heading element.
 *
 * @param {Element | null | undefined} element
 * @returns {{
 *     id: string;
 *     title: string;
 *     description: string | null;
 *     badExample: string | null;
 *     goodExample: string | null;
 *     correction: string | null;
 * } | null}
 */
function createDiagnosticMetadataFromHeading(element) {
    const headingText = getNormalizedTextContent(element, { trim: true });
    if (!headingText) {
        return null;
    }

    const match = headingText.match(/^(GM\d{3,})\s*-\s*(.+)$/);
    if (!match) {
        return null;
    }

    const [, id, title] = match;
    const blocks = collectBlocksAfter(element, {
        stopTags: ["h3", "h2"]
    });

    const { descriptionParts, correctionParts, badExample, goodExample } =
        summariseDiagnosticBlocks(blocks);

    return {
        id,
        title: getNonEmptyTrimmedString(title) ?? title.trim(),
        description: joinSections(descriptionParts),
        badExample,
        goodExample,
        correction: joinSections(correctionParts)
    };
}

/**
 * Collect diagnostic metadata entries from a list of heading nodes.
 *
 * @param {Iterable<Element>} headingElements
 */
function collectDiagnosticsFromHeadings(headingElements) {
    const diagnostics = [];
    for (const heading of headingElements ?? []) {
        const metadata = createDiagnosticMetadataFromHeading(heading);
        if (metadata) {
            diagnostics.push(metadata);
        }
    }
    return diagnostics;
}

function parseDiagnostics(html) {
    const document = parseDocument(html);
    return collectDiagnosticsFromHeadings(document.querySelectorAll("h3"));
}

function parseNamingRules(html) {
    const document = parseDocument(html);
    const heading = document.querySelector("h2#s4");
    if (!heading) {
        return {
            overview: null,
            notes: [],
            namingStyleOptions: [],
            supportsPrefix: false,
            supportsSuffix: false,
            supportsPreserveUnderscores: false,
            ruleSections: []
        };
    }

    const blocks = collectBlocksAfter(heading, { stopTags: ["h2"] });
    const content = normalizeContent(blocks);
    const overview = joinSections(content.paragraphs);
    const notes = content.notes;
    const requiresMessage =
        (overview && overview.includes("GM2017")) ||
        notes.find((note) => note.includes("GM2017"))
            ? "GM2017"
            : null;

    let sibling = heading.nextElementSibling;
    let mainList = null;
    while (sibling) {
        if (getTagName(sibling) === "ul") {
            mainList = sibling;
            break;
        }
        sibling = sibling.nextElementSibling;
    }

    const {
        namingStyleOptions,
        identifierBlocklist,
        identifierRuleSummary,
        supportsPrefix,
        supportsSuffix,
        supportsPreserveUnderscores,
        ruleSections
    } = collectNamingListMetadata(mainList);

    return {
        overview,
        notes,
        namingStyleOptions,
        requiresMessage,
        supportsPrefix,
        supportsSuffix,
        supportsPreserveUnderscores,
        identifierBlocklist: identifierBlocklist ?? null,
        identifierRuleSummary: identifierRuleSummary ?? null,
        ruleSections
    };
}

function parseDirectiveSections(html) {
    const document = parseDocument(html);
    const sections = [];

    for (const element of document.querySelectorAll("h2")) {
        const title = getNormalizedTextContent(element, { trim: true });
        if (!title) {
            continue;
        }

        const blocks = collectBlocksAfter(element, { stopTags: ["h2"] });
        const id = element.getAttribute("id") || slugify(title);
        const content = normalizeContent(blocks);
        sections.push({
            id,
            title,
            description: joinSections(content.paragraphs) || null,
            notes: content.notes,
            codeExamples: content.codeExamples,
            lists: content.lists,
            subheadings: content.headings,
            tables: content.tables
        });
    }

    return sections;
}

function parseBaseTypeTable(table) {
    const baseTypes = [];
    const rowElements = Array.from(
        table.querySelectorAll("tbody > tr, thead + tr")
    );

    rowElements.forEach((row, index) => {
        if (index === 0) {
            return;
        }

        const cells = getDirectChildren(row, "th, td");
        if (cells.length < 3) {
            return;
        }

        const [nameCell, exampleCell, descriptionCell] = cells;
        const name = extractText(nameCell, { preserveLineBreaks: false });
        const specifierExamples = splitCellLines(exampleCell);
        const description = extractText(descriptionCell, {
            preserveLineBreaks: false
        });
        baseTypes.push({ name, specifierExamples, description });
    });

    return baseTypes;
}

function parseTypeValidationTable(table) {
    if (!table) {
        return null;
    }

    const headerRow = table.querySelector("tr");
    if (!headerRow) {
        return null;
    }

    const headerCells = getDirectChildren(headerRow, "th, td");
    const columns = headerCells
        .slice(1)
        .map((cell) =>
            getNonEmptyTrimmedString(
                extractText(cell, { preserveLineBreaks: false })
            )
        )
        .filter(Boolean);

    const rows = [];
    const dataRows = Array.from(table.querySelectorAll("tr")).slice(1);
    for (const row of dataRows) {
        const cells = getDirectChildren(row, "th, td");
        if (cells.length === 0) {
            continue;
        }
        const from = getNonEmptyTrimmedString(
            extractText(cells[0], { preserveLineBreaks: false })
        );
        if (!from) {
            continue;
        }
        const results = {};
        columns.forEach((column, columnIndex) => {
            const cell = cells[columnIndex + 1];
            const outcome = cell
                ? getNonEmptyTrimmedString(
                      extractText(cell, { preserveLineBreaks: false })
                  )
                : null;
            const rawStyle = cell?.getAttribute?.("style");
            const style = getNonEmptyTrimmedString(
                rawStyle?.replaceAll(/\s+/g, " ")
            );
            results[column] = {
                outcome,
                style
            };
        });
        rows.push({ from, results });
    }

    return { columns, rows };
}

function parseTypeSystem(html) {
    const document = parseDocument(html);
    const introBlocks = [];
    const articleBody = document.querySelector("h1");
    if (articleBody) {
        let node = articleBody.nextSibling;
        while (node) {
            if (isElement(node) && getTagName(node) === "table") {
                break;
            }
            if (isElement(node)) {
                const block = createBlock(node);
                if (block) {
                    introBlocks.push(block);
                }
            }
            node = node.nextSibling;
        }
    }
    const introContent = normalizeContent(introBlocks);

    const tables = Array.from(document.querySelectorAll("table"));
    const baseTypeTable = tables[0] ?? null;
    const baseTypes = baseTypeTable ? parseBaseTypeTable(baseTypeTable) : [];

    const noteBlocks = Array.from(document.querySelectorAll("p.note"))
        .map((element) => createBlock(element))
        .filter(Boolean);
    const notes = normalizeMultilineTextCollection(
        noteBlocks.map((block) => block.text)
    );

    const specifierSections = [];
    for (const element of document.querySelectorAll("h3")) {
        const title = getNormalizedTextContent(element, { trim: true });
        if (!title) {
            continue;
        }
        const blocks = collectBlocksAfter(element, {
            stopTags: ["h3", "h2"]
        });
        const content = normalizeContent(blocks);
        specifierSections.push({
            id: element.getAttribute("id") || slugify(title),
            title,
            description: joinSections(content.paragraphs) || undefined,
            notes: content.notes,
            codeExamples: content.codeExamples,
            lists: content.lists
        });
    }

    const typeValidationHeading = Array.from(
        document.querySelectorAll("h2")
    ).find((element) => element.textContent?.includes("Type Validation"));

    let typeValidation = null;
    let typeValidationBlocks = [];
    if (typeValidationHeading) {
        typeValidationBlocks = collectBlocksAfter(typeValidationHeading, {
            stopTags: ["table", "h2"]
        });
        let sibling = typeValidationHeading.nextElementSibling;
        let validationTable = null;
        while (sibling) {
            if (getTagName(sibling) === "table") {
                validationTable = sibling;
                break;
            }
            if (getTagName(sibling) === "h2") {
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        typeValidation = validationTable
            ? parseTypeValidationTable(validationTable)
            : null;
    }

    const typeValidationContent = normalizeContent(typeValidationBlocks);

    return {
        overview: joinSections(introContent.paragraphs) || undefined,
        overviewNotes: introContent.notes,
        baseTypes: baseTypes.map((type) => ({
            name: type.name,
            specifierExamples: normalizeMultilineTextCollection(
                type.specifierExamples
            ),
            description: normalizeMultilineText(type.description)
        })),
        notes,
        specifierSections,
        typeValidation: typeValidation
            ? {
                  description:
                      joinSections(typeValidationContent.paragraphs) ||
                      undefined,
                  notes: typeValidationContent.notes,
                  codeExamples: typeValidationContent.codeExamples,
                  lists: typeValidationContent.lists,
                  table: typeValidation
              }
            : undefined
    };
}

function createFeatherManualMetadataPayload({
    manualRef,
    manualRepo,
    sections
}) {
    return {
        meta: {
            manualRef: manualRef.ref,
            commitSha: manualRef.sha,
            generatedAt: new Date().toISOString(),
            source: manualRepo,
            manualPaths: { ...FEATHER_PAGES }
        },
        ...sections
    };
}

async function fetchFeatherManualPayloads({
    manualRef,
    fetchManualFile: fetchManualFileFn,
    forceRefresh,
    verbose,
    cacheRoot,
    rawRoot,
    progressBarWidth
}) {
    const manualEntries = Object.entries(FEATHER_PAGES);
    const totalManualPages = manualEntries.length;

    announceManualDownloadStart(totalManualPages, {
        verbose,
        description: "manual page"
    });

    return downloadManualEntriesWithProgress({
        entries: manualEntries,
        manualRefSha: manualRef.sha,
        fetchManualFile: fetchManualFileFn,
        requestOptions: {
            forceRefresh,
            verbose,
            cacheRoot,
            rawRoot
        },
        progress: {
            label: "Downloading manual pages",
            verbose,
            progressBarWidth
        }
    });
}

/**
 * Parse the downloaded manual payloads into normalized section metadata.
 * Keeping the transformation logic isolated lets the command orchestrator
 * delegate high-level steps without juggling raw payload bookkeeping.
 */

function parseFeatherManualPayloads(htmlPayloads, { verbose }) {
    if (verbose.parsing) {
        console.log("Parsing manual sections…");
    }

    return {
        diagnostics: timeSync(
            "Diagnostics",
            () => parseDiagnostics(htmlPayloads.diagnostics),
            { verbose }
        ),
        directives: timeSync(
            "Directives",
            () => parseDirectiveSections(htmlPayloads.directives),
            { verbose }
        ),
        namingRules: timeSync(
            "Naming rules",
            () => parseNamingRules(htmlPayloads.naming),
            { verbose }
        ),
        typeSystem: timeSync(
            "Type system",
            () => parseTypeSystem(htmlPayloads.typeSystem),
            { verbose }
        )
    };
}

/**
 * Download and parse the manual pages required to build the Feather metadata
 * artefact. Returning the final payload keeps the command runner free from
 * low-level payload maps and section assembly concerns.
 */
async function buildFeatherMetadataPayload({
    manualRef,
    manualRepo,
    fetchManualFile: fetchManualFileFn,
    forceRefresh,
    verbose,
    cacheRoot,
    rawRoot,
    progressBarWidth
}) {
    const htmlPayloads = await fetchFeatherManualPayloads({
        manualRef,
        fetchManualFile: fetchManualFileFn,
        forceRefresh,
        verbose,
        cacheRoot,
        rawRoot,
        progressBarWidth
    });

    const sections = parseFeatherManualPayloads(htmlPayloads, { verbose });

    return createFeatherManualMetadataPayload({
        manualRef,
        manualRepo,
        sections
    });
}

/**
 * Execute the Feather metadata generation workflow.
 *
 * @param {{ command?: import("commander").Command }} [context]
 * @returns {Promise<number>}
 */
export async function runGenerateFeatherMetadata({ command } = {}) {
    try {
        assertSupportedNodeVersion();

        const {
            ref,
            outputPath,
            forceRefresh,
            verbose,
            progressBarWidth,
            cacheRoot,
            manualRepo,
            usage
        } = resolveFeatherMetadataOptions(command);

        const { apiRoot, rawRoot } = buildManualRepositoryEndpoints(manualRepo);
        const logCompletion = createVerboseDurationLogger({ verbose });
        const unresolvedManualRef = await resolveManualRef(ref, {
            verbose,
            apiRoot
        });
        const manualRef = ensureManualRefHasSha(unresolvedManualRef, { usage });
        console.log(`Using manual ref '${manualRef.ref}' (${manualRef.sha}).`);

        const payload = await buildFeatherMetadataPayload({
            manualRef,
            manualRepo,
            fetchManualFile,
            forceRefresh,
            verbose,
            cacheRoot,
            rawRoot,
            progressBarWidth
        });

        await writeManualJsonArtifact({
            outputPath,
            payload,
            onAfterWrite: () => {
                console.log(`Wrote Feather metadata to ${outputPath}`);
            }
        });
        logCompletion();
        return 0;
    } finally {
        disposeProgressBars();
    }
}
