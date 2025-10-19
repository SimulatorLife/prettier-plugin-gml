import fs from "node:fs/promises";
import path from "node:path";
import { parseHTML } from "linkedom";

import { Command, InvalidArgumentError } from "commander";

import {
    escapeRegExp,
    getNonEmptyTrimmedString,
    toNormalizedLowerCaseSet
} from "../lib/shared-deps.js";
import { CliUsageError } from "../lib/cli-errors.js";
import { assertSupportedNodeVersion } from "../lib/node-version.js";
import { timeSync, createVerboseDurationLogger } from "../lib/time-utils.js";
import {
    renderProgressBar,
    disposeProgressBars,
    resolveProgressBarWidth,
    getDefaultProgressBarWidth
} from "../lib/progress-bar.js";
import { ensureDir } from "../lib/file-system.js";
import {
    MANUAL_CACHE_ROOT_ENV_VAR,
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    resolveManualRepoValue
} from "../lib/manual-utils.js";
import {
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyManualEnvOptionOverrides
} from "../lib/manual-env.js";
import { applyStandardCommandOptions } from "../lib/command-standard-options.js";
import { resolveManualCommandOptions } from "../lib/manual-command-options.js";
import { createManualCommandContext } from "../lib/manual-command-context.js";

const {
    repoRoot: REPO_ROOT,
    defaultCacheRoot: DEFAULT_CACHE_ROOT,
    defaultOutputPath: OUTPUT_DEFAULT,
    fetchManualFile,
    resolveManualRef
} = createManualCommandContext({
    importMetaUrl: import.meta.url,
    userAgent: "prettier-plugin-gml feather metadata generator",
    outputFileName: "feather-metadata.json"
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

export function createFeatherMetadataCommand({ env = process.env } = {}) {
    const command = applyStandardCommandOptions(
        new Command()
            .name("generate-feather-metadata")
            .usage("[options]")
            .description(
                "Generate feather-metadata.json from the GameMaker manual."
            )
    )
        .option(
            "-r, --ref <git-ref>",
            "Manual git ref (tag, branch, or commit)."
        )
        .option(
            "-o, --output <path>",
            `Output JSON path (default: ${OUTPUT_DEFAULT}).`,
            (value) => path.resolve(value),
            OUTPUT_DEFAULT
        )
        .option(
            "--force-refresh",
            "Ignore cached manual artefacts and re-download."
        )
        .option("--quiet", "Suppress progress output (useful in CI).")
        .option(
            "--manual-repo <owner/name>",
            `GitHub repository hosting the manual (default: ${DEFAULT_MANUAL_REPO}).`,
            (value) => {
                try {
                    return resolveManualRepoValue(value);
                } catch (error) {
                    throw new InvalidArgumentError(error.message);
                }
            },
            DEFAULT_MANUAL_REPO
        )
        .option(
            "--cache-root <path>",
            `Directory to store cached manual artefacts (default: ${DEFAULT_CACHE_ROOT}).`,
            (value) => path.resolve(value),
            DEFAULT_CACHE_ROOT
        )
        .option(
            "--progress-bar-width <columns>",
            `Width of progress bars rendered in the terminal (default: ${getDefaultProgressBarWidth()}).`,
            (value) => {
                try {
                    return resolveProgressBarWidth(value);
                } catch (error) {
                    throw new InvalidArgumentError(error.message);
                }
            },
            getDefaultProgressBarWidth()
        );

    command.addHelpText(
        "after",
        [
            "",
            "Environment variables:",
            `  ${MANUAL_REPO_ENV_VAR}    Override the manual repository (owner/name).`,
            `  ${MANUAL_CACHE_ROOT_ENV_VAR}  Override the cache directory for manual artefacts.`,
            "  GML_MANUAL_REF          Set the default manual ref (tag, branch, or commit).",
            `  ${PROGRESS_BAR_WIDTH_ENV_VAR}     Override the progress bar width.`
        ].join("\n")
    );

    applyManualEnvOptionOverrides({
        command,
        env,
        getUsage: () => command.helpInformation()
    });

    return command;
}
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

// Manual fetching helpers are provided by manual-cli-helpers.js

function normalizeMultilineText(text) {
    if (typeof text !== "string" || text.length === 0) {
        return null;
    }

    const trimmedLines = text.split("\n").map((line) => line.trim());
    const collapsedLines = trimmedLines.filter((line, index) => {
        return line.length > 0 || trimmedLines[index - 1]?.length > 0;
    });

    return collapsedLines.join("\n").trim();
}

function sanitizeManualString(value) {
    if (typeof value !== "string") {
        return null;
    }

    return normalizeMultilineText(value);
}

function getNormalizedTextContent(element, { trim = false } = {}) {
    if (!element) {
        return trim ? null : "";
    }

    const { textContent } = element;
    if (typeof textContent !== "string" || textContent.length === 0) {
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
    const matches = selector
        ? (child) => child.matches?.(selector) === true
        : () => true;
    return Array.from(element?.children ?? []).filter((child) =>
        matches(child)
    );
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

        const hasContent = values.some((value) => value && value.trim());
        if (!hasContent) {
            return;
        }

        const hasHeaderCells = cellElements.some(
            (cell) => getTagName(cell) === "th"
        );
        if (rowIndex === 0 && hasHeaderCells) {
            headers.push(
                ...values
                    .map((value) => normalizeMultilineText(value))
                    .filter(Boolean)
            );
            return;
        }

        rows.push(values.map((value) => normalizeMultilineText(value) ?? null));
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

function normalizeContent(blocks) {
    const content = {
        paragraphs: [],
        notes: [],
        codeExamples: [],
        lists: [],
        headings: [],
        tables: []
    };
    const appendNormalizedText = (target, text) => {
        const normalized = normalizeMultilineText(text);
        if (normalized) {
            target.push(normalized);
        }
    };

    for (const block of blocks) {
        if (!block) {
            continue;
        }

        switch (block.type) {
            case "code": {
                if (block.text) {
                    content.codeExamples.push(block.text);
                }
                break;
            }
            case "note": {
                appendNormalizedText(content.notes, block.text);
                break;
            }
            case "list": {
                const items = Array.isArray(block.items)
                    ? block.items
                          .map((item) => normalizeMultilineText(item))
                          .filter(Boolean)
                    : [];
                if (items.length > 0) {
                    content.lists.push(items);
                }
                break;
            }
            case "table": {
                if (block.table) {
                    content.tables.push(block.table);
                }
                break;
            }
            case "heading": {
                appendNormalizedText(content.headings, block.text);
                break;
            }
            default:
                appendNormalizedText(content.paragraphs, block.text);
        }
    }
    return content;
}

function joinSections(parts) {
    if (!Array.isArray(parts) || parts.length === 0) {
        return null;
    }

    const normalizedParts = parts
        .map((part) => getNonEmptyTrimmedString(part))
        .filter(Boolean);

    if (normalizedParts.length === 0) {
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

        if (block.type === "code") {
            if (badExample) {
                goodExampleParts.push(text);
            } else {
                badExample = text;
            }
            continue;
        }

        if (badExample) {
            correctionParts.push(text);
        } else {
            additionalDescriptionParts.push(text);
        }
    }

    const goodExample =
        goodExampleParts.length > 0
            ? goodExampleParts.join("\n\n").trim()
            : null;

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

function parseDiagnostics(html) {
    const document = parseDocument(html);
    const diagnostics = [];

    for (const element of document.querySelectorAll("h3")) {
        const headingText = element.textContent
            ?.replaceAll("\u00A0", " ")
            .trim();
        if (!headingText) {
            continue;
        }

        const match = headingText.match(/^(GM\d{3,})\s*-\s*(.+)$/);
        if (!match) {
            continue;
        }

        const [, id, title] = match;
        const blocks = collectBlocksAfter(element, {
            stopTags: ["h3", "h2"]
        });

        const { descriptionParts, correctionParts, badExample, goodExample } =
            summariseDiagnosticBlocks(blocks);

        const description = joinSections(descriptionParts);
        const correction = joinSections(correctionParts);

        diagnostics.push({
            id,
            title: title.trim(),
            description,
            badExample,
            goodExample,
            correction
        });
    }

    return diagnostics;
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

    let namingStyleOptions = [];
    let identifierBlocklist = null;
    let identifierRuleSummary = null;
    let supportsPrefix = false;
    let supportsSuffix = false;
    let supportsPreserveUnderscores = false;
    const ruleSections = [];

    if (mainList) {
        for (const strongEl of mainList.querySelectorAll("li > strong")) {
            const strongText = strongEl.textContent
                ?.replaceAll("\u00A0", " ")
                .trim();
            if (!strongText) {
                continue;
            }

            const listItem = strongEl.closest("li");
            if (!listItem) {
                continue;
            }

            if (strongText === "Naming Style") {
                namingStyleOptions = Array.from(
                    listItem.querySelectorAll("ul li")
                )
                    .map((styleEl) =>
                        extractSanitizedText(styleEl, {
                            preserveLineBreaks: false
                        })
                    )
                    .filter(Boolean);
            } else if (strongText === "Identifier Blocklist") {
                identifierBlocklist = extractSanitizedText(listItem, {
                    preserveLineBreaks: true
                });
            } else if (strongText.endsWith("Naming Rule")) {
                identifierRuleSummary = extractSanitizedText(listItem, {
                    preserveLineBreaks: true
                });
            } else if (strongText === "Prefix") {
                supportsPrefix = true;
            } else if (strongText === "Suffix") {
                supportsSuffix = true;
            } else if (strongText.toLowerCase().includes("preserve")) {
                supportsPreserveUnderscores = true;
            }
        }

        for (const item of getDirectChildren(mainList, "li")) {
            const strongChildren = getDirectChildren(item, "strong");
            const title = getNormalizedTextContent(strongChildren[0], {
                trim: true
            });
            const description = extractText(item, {
                preserveLineBreaks: true
            });
            let normalizedDescription = normalizeMultilineText(description);
            if (title && normalizedDescription) {
                const prefixPattern = new RegExp(
                    `^${escapeRegExp(title)}\s*:?\s*`,
                    "i"
                );
                normalizedDescription = normalizedDescription.replace(
                    prefixPattern,
                    ""
                );
                normalizedDescription = normalizedDescription.trim();
            }

            const nestedList = item.querySelector("ul");
            let options = [];
            if (nestedList) {
                options = getDirectChildren(nestedList, "li")
                    .map((option) =>
                        normalizeMultilineText(
                            extractText(option, { preserveLineBreaks: false })
                        )
                    )
                    .filter(Boolean);
            }

            ruleSections.push({
                title,
                description: normalizedDescription,
                options
            });
        }
    }

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
    const notes = noteBlocks
        .map((block) => normalizeMultilineText(block.text))
        .filter(Boolean);

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
            specifierExamples: type.specifierExamples
                .map((example) => normalizeMultilineText(example))
                .filter(Boolean),
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

    if (verbose.downloads) {
        console.log(
            `Fetching ${totalManualPages} manual page${
                totalManualPages === 1 ? "" : "s"
            }…`
        );
    }

    const htmlPayloads = {};
    let fetchedCount = 0;
    for (const [key, manualPath] of manualEntries) {
        htmlPayloads[key] = await fetchManualFileFn(manualRef.sha, manualPath, {
            forceRefresh,
            verbose,
            cacheRoot,
            rawRoot
        });
        fetchedCount += 1;
        reportManualFetchProgress({
            manualPath,
            fetchedCount,
            totalManualPages,
            verbose,
            progressBarWidth
        });
    }

    return htmlPayloads;
}

function reportManualFetchProgress({
    manualPath,
    fetchedCount,
    totalManualPages,
    verbose,
    progressBarWidth
}) {
    if (!verbose.downloads) {
        return;
    }

    if (verbose.progressBar) {
        renderProgressBar(
            "Downloading manual pages",
            fetchedCount,
            totalManualPages,
            progressBarWidth
        );
        return;
    }

    console.log(`✓ ${manualPath}`);
}

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
        const manualRef = await resolveManualRef(ref, { verbose, apiRoot });
        if (!manualRef?.sha) {
            throw new CliUsageError("Could not resolve manual commit SHA.", {
                usage
            });
        }
        console.log(`Using manual ref '${manualRef.ref}' (${manualRef.sha}).`);

        const htmlPayloads = await fetchFeatherManualPayloads({
            manualRef,
            fetchManualFile,
            forceRefresh,
            verbose,
            cacheRoot,
            rawRoot,
            progressBarWidth
        });

        const sections = parseFeatherManualPayloads(htmlPayloads, { verbose });
        const payload = createFeatherManualMetadataPayload({
            manualRef,
            manualRepo,
            sections
        });

        await ensureDir(path.dirname(outputPath));
        await fs.writeFile(
            outputPath,
            `${JSON.stringify(payload, undefined, 2)}\n`,
            "utf8"
        );

        console.log(`Wrote Feather metadata to ${outputPath}`);
        logCompletion();
        return 0;
    } finally {
        disposeProgressBars();
    }
}
