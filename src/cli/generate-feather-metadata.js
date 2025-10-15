import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

import { Command, InvalidArgumentError } from "commander";

import { escapeRegExp } from "../shared/regexp.js";
import { handleCliError } from "./cli-errors.js";
import { assertSupportedNodeVersion } from "./runtime/node-version.js";
import {
    createManualGitHubClient,
    ensureDir,
    formatDuration,
    renderProgressBar,
    disposeProgressBars,
    timeSync
} from "./manual/manual-cli-helpers.js";
import {
    MANUAL_CACHE_ROOT_ENV_VAR,
    resolveManualCacheRoot
} from "./options/manual-cache.js";
import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    resolveProgressBarWidth
} from "./options/progress-bar.js";
import {
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    buildManualRepositoryEndpoints,
    resolveManualRepoValue
} from "./options/manual-repo.js";
import { applyEnvOptionOverride } from "./options/env-overrides.js";
import { parseCommandLine } from "./command-parsing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CACHE_ROOT = resolveManualCacheRoot({ repoRoot: REPO_ROOT });
const OUTPUT_DEFAULT = path.join(
    REPO_ROOT,
    "resources",
    "feather-metadata.json"
);

const { rawRoot: DEFAULT_MANUAL_RAW_ROOT } = buildManualRepositoryEndpoints();

const manualClient = createManualGitHubClient({
    userAgent: "prettier-plugin-gml feather metadata generator",
    defaultCacheRoot: DEFAULT_CACHE_ROOT,
    defaultRawRoot: DEFAULT_MANUAL_RAW_ROOT
});

const { fetchManualFile, resolveManualRef } = manualClient;

const FEATHER_PAGES = {
    diagnostics:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Messages.htm",
    directives:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Directives.htm",
    naming: "Manual/contents/Setting_Up_And_Version_Information/IDE_Preferences/Feather_Settings.htm",
    typeSystem:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Data_Types.htm"
};

const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";

function createFeatherMetadataCommand() {
    const command = new Command()
        .name("generate-feather-metadata")
        .usage("[options]")
        .description(
            "Generate feather-metadata.json from the GameMaker manual."
        )
        .exitOverride()
        .allowExcessArguments(false)
        .helpOption("-h, --help", "Show this help message.")
        .showHelpAfterError("(add --help for usage information)")
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
            "--progress-bar-width <n>",
            `Width of the terminal progress bar (default: ${DEFAULT_PROGRESS_BAR_WIDTH}).`,
            (value) => {
                try {
                    return resolveProgressBarWidth(value);
                } catch (error) {
                    throw new InvalidArgumentError(error.message);
                }
            },
            DEFAULT_PROGRESS_BAR_WIDTH
        )
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
        );

    command.addHelpText(
        "after",
        [
            "",
            "Environment variables:",
            `  ${MANUAL_REPO_ENV_VAR}    Override the manual repository (owner/name).`,
            `  ${MANUAL_CACHE_ROOT_ENV_VAR}  Override the cache directory for manual artefacts.`,
            `  ${PROGRESS_BAR_WIDTH_ENV_VAR}    Override the progress bar width.`,
            "  GML_MANUAL_REF          Set the default manual ref (tag, branch, or commit)."
        ].join("\n")
    );

    return command;
}

function parseArgs({
    argv = process.argv.slice(2),
    env = process.env,
    isTty = process.stdout.isTTY === true
} = {}) {
    const command = createFeatherMetadataCommand();
    const getUsage = () => command.helpInformation();

    if (env.GML_MANUAL_REF) {
        command.setOptionValueWithSource("ref", env.GML_MANUAL_REF, "env");
    }

    applyEnvOptionOverride({
        command,
        env,
        envVar: MANUAL_REPO_ENV_VAR,
        optionName: "manualRepo",
        resolveValue: (value) =>
            resolveManualRepoValue(value, { source: "env" }),
        getUsage
    });

    applyEnvOptionOverride({
        command,
        env,
        envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
        optionName: "progressBarWidth",
        resolveValue: resolveProgressBarWidth,
        getUsage
    });

    const verbose = {
        resolveRef: true,
        downloads: true,
        parsing: true,
        progressBar: isTty
    };

    const { helpRequested, usage } = parseCommandLine(command, argv);
    if (helpRequested) {
        return {
            helpRequested: true,
            usage
        };
    }

    const options = command.opts();

    if (options.quiet) {
        verbose.resolveRef = false;
        verbose.downloads = false;
        verbose.parsing = false;
        verbose.progressBar = false;
    }

    return {
        ref: options.ref ?? null,
        outputPath: options.output ?? OUTPUT_DEFAULT,
        forceRefresh: Boolean(options.forceRefresh),
        verbose,
        progressBarWidth:
            options.progressBarWidth ?? DEFAULT_PROGRESS_BAR_WIDTH,
        cacheRoot: options.cacheRoot ?? DEFAULT_CACHE_ROOT,
        manualRepo: options.manualRepo ?? DEFAULT_MANUAL_REPO,
        helpRequested: false,
        usage
    };
}

// Manual fetching helpers are provided by manual-cli-helpers.js

function normaliseMultilineText(text) {
    if (!text) {
        return null;
    }
    const lines = text.split("\n").map((line) => line.trim());
    const cleaned = [];
    for (const line of lines) {
        if (line) {
            cleaned.push(line);
        } else {
            if (cleaned.length > 0 && cleaned.at(-1) !== "") {
                cleaned.push("");
            }
        }
    }
    return cleaned.join("\n").trim();
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
            ?.replaceAll('\u00A0', " ")
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
                    .map((value) => normaliseMultilineText(value))
                    .filter(Boolean)
            );
            return;
        }

        rows.push(values.map((value) => normaliseMultilineText(value) ?? null));
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
    default: { if (tagName === "div" && classList.contains("codeblock")) {
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

    let text = clone.textContent?.replaceAll('\u00A0', " ") ?? "";
    if (preserveLineBreaks) {
        return text
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n")
            .trim();
    }

    return text.replaceAll(/\s+/g, " ").trim();
}

function collectBlocksAfter(element, { stopTags = [] } = {}) {
    const stopSet = new Set(stopTags.map((tag) => tag.toLowerCase()));
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

function normaliseTextBlock(block) {
    if (!block) {
        return null;
    }
    if (
        block.type === "list" &&
        Array.isArray(block.items) &&
        block.items.length > 0
    ) {
        return block.items.join("\n").trim() || null;
    }
    return block.text?.trim() || null;
}

function normaliseContent(blocks) {
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
        if (block.type === "code") {
            if (block.text) {
                content.codeExamples.push(block.text);
            }
            continue;
        }
        if (block.type === "note") {
            const note = normaliseMultilineText(block.text ?? "");
            if (note) {
                content.notes.push(note);
            }
            continue;
        }
        if (block.type === "list") {
            const items = Array.isArray(block.items)
                ? block.items
                      .map((item) => normaliseMultilineText(item))
                      .filter(Boolean)
                : [];
            if (items.length > 0) {
                content.lists.push(items);
            }
            continue;
        }
        if (block.type === "table") {
            if (block.table) {
                content.tables.push(block.table);
            }
            continue;
        }
        if (block.type === "heading") {
            const heading = normaliseMultilineText(block.text ?? "");
            if (heading) {
                content.headings.push(heading);
            }
            continue;
        }
        const paragraph = normaliseMultilineText(block.text ?? "");
        if (paragraph) {
            content.paragraphs.push(paragraph);
        }
    }
    return content;
}

function joinSections(parts) {
    return (
        parts
            .map((part) => part.trim())
            .filter(Boolean)
            .join("\n\n") || null
    );
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
        const text = normaliseTextBlock(block);
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
    let badExample = null;
    let goodExample = null;

    for (const block of blocks) {
        if (block.type === "heading") {
            continue;
        }
        if (block.type === "code") {
            const codeText = normaliseTextBlock(block);
            if (!codeText) {
                continue;
            }
            if (!badExample) {
                badExample = codeText;
            } else if (goodExample) {
                goodExample = `${goodExample}\n\n${codeText}`.trim();
            } else {
                goodExample = codeText;
            }
            continue;
        }

        const text = normaliseTextBlock(block);
        if (!text) {
            continue;
        }
        if (badExample) {
            correctionParts.push(text);
        } else {
            additionalDescriptionParts.push(text);
        }
    }

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
        const headingText = element.textContent?.replaceAll('\u00A0', " ").trim();
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
    const content = normaliseContent(blocks);
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
                ?.replaceAll('\u00A0', " ")
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
                ).map((styleEl) =>
                    extractText(styleEl, { preserveLineBreaks: false })
                );
            } else if (strongText === "Identifier Blocklist") {
                identifierBlocklist = extractText(listItem, {
                    preserveLineBreaks: true
                });
            } else if (strongText.endsWith("Naming Rule")) {
                identifierRuleSummary = extractText(listItem, {
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
            const title =
                strongChildren[0]?.textContent
                    ?.replaceAll('\u00A0', " ")
                    .trim() || null;
            const description = extractText(item, {
                preserveLineBreaks: true
            });
            let normalisedDescription = normaliseMultilineText(
                description ?? ""
            );
            if (title && normalisedDescription) {
                const prefixPattern = new RegExp(
                    `^${escapeRegExp(title)}\s*:?\s*`,
                    "i"
                );
                normalisedDescription = normalisedDescription.replace(
                    prefixPattern,
                    ""
                );
                normalisedDescription = normalisedDescription.trim();
            }

            const nestedList = item.querySelector("ul");
            let options = [];
            if (nestedList) {
                options = getDirectChildren(nestedList, "li")
                    .map((option) =>
                        normaliseMultilineText(
                            extractText(option, { preserveLineBreaks: false })
                        )
                    )
                    .filter(Boolean);
            }

            ruleSections.push({
                title,
                description: normalisedDescription,
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
        identifierBlocklist,
        identifierRuleSummary,
        ruleSections
    };
}

function parseDirectiveSections(html) {
    const document = parseDocument(html);
    const sections = [];

    for (const element of document.querySelectorAll("h2")) {
        const title = element.textContent?.replaceAll('\u00A0', " ").trim();
        if (!title) {
            continue;
        }

        const blocks = collectBlocksAfter(element, { stopTags: ["h2"] });
        const id = element.getAttribute("id") || slugify(title);
        const content = normaliseContent(blocks);
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
        .map((cell) => extractText(cell, { preserveLineBreaks: false }))
        .filter(Boolean);

    const rows = [];
    const dataRows = Array.from(table.querySelectorAll("tr")).slice(1);
    for (const row of dataRows) {
        const cells = getDirectChildren(row, "th, td");
        if (cells.length === 0) {
            continue;
        }
        const from = extractText(cells[0], { preserveLineBreaks: false });
        if (!from) {
            continue;
        }
        const results = {};
        columns.forEach((column, columnIndex) => {
            const cell = cells[columnIndex + 1];
            const outcome = cell
                ? extractText(cell, { preserveLineBreaks: false }) || null
                : null;
            const style = cell?.getAttribute?.("style") ?? null;
            results[column] = {
                outcome,
                style: style?.replaceAll(/\s+/g, " ").trim() || null
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
    const introContent = normaliseContent(introBlocks);

    const tables = Array.from(document.querySelectorAll("table"));
    const baseTypeTable = tables[0] ?? null;
    const baseTypes = baseTypeTable ? parseBaseTypeTable(baseTypeTable) : [];

    const noteBlocks = Array.from(document.querySelectorAll("p.note"))
        .map((element) => createBlock(element))
        .filter(Boolean);
    const notes = noteBlocks
        .map((block) => normaliseMultilineText(block.text ?? ""))
        .filter(Boolean);

    const specifierSections = [];
    for (const element of document.querySelectorAll("h3")) {
        const title = element.textContent?.replaceAll('\u00A0', " ").trim();
        if (!title) {
            continue;
        }
        const blocks = collectBlocksAfter(element, {
            stopTags: ["h3", "h2"]
        });
        const content = normaliseContent(blocks);
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

    const typeValidationContent = normaliseContent(typeValidationBlocks);

    return {
        overview: joinSections(introContent.paragraphs) || undefined,
        overviewNotes: introContent.notes,
        baseTypes: baseTypes.map((type) => ({
            name: type.name,
            specifierExamples: type.specifierExamples
                .map((example) => normaliseMultilineText(example))
                .filter(Boolean),
            description: normaliseMultilineText(type.description)
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

async function main({ argv, env, isTty } = {}) {
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
            helpRequested
        } = parseArgs({ argv, env, isTty });

        if (helpRequested) {
            return 0;
        }
        const { apiRoot, rawRoot } = buildManualRepositoryEndpoints(manualRepo);
        const startTime = Date.now();
        const manualRef = await resolveManualRef(ref, { verbose, apiRoot });
        if (!manualRef?.sha) {
            throw new Error("Could not resolve manual commit SHA.");
        }
        console.log(`Using manual ref '${manualRef.ref}' (${manualRef.sha}).`);

        const htmlPayloads = {};
        const manualEntries = Object.entries(FEATHER_PAGES);
        const totalManualPages = manualEntries.length;
        if (verbose.downloads) {
            console.log(
                `Fetching ${totalManualPages} manual page${
                    totalManualPages === 1 ? "" : "s"
                }…`
            );
        }

        let fetchedCount = 0;
        for (const [key, manualPath] of manualEntries) {
            htmlPayloads[key] = await fetchManualFile(
                manualRef.sha,
                manualPath,
                {
                    forceRefresh,
                    verbose,
                    cacheRoot,
                    rawRoot
                }
            );
            fetchedCount += 1;
            if (verbose.progressBar && verbose.downloads) {
                renderProgressBar(
                    "Downloading manual pages",
                    fetchedCount,
                    totalManualPages,
                    progressBarWidth
                );
            } else if (verbose.downloads) {
                console.log(`✓ ${manualPath}`);
            }
        }
        if (verbose.parsing) {
            console.log("Parsing manual sections…");
        }
        const diagnostics = timeSync(
            "Diagnostics",
            () => parseDiagnostics(htmlPayloads.diagnostics),
            { verbose }
        );
        const directives = timeSync(
            "Directives",
            () => parseDirectiveSections(htmlPayloads.directives),
            { verbose }
        );
        const namingRules = timeSync(
            "Naming rules",
            () => parseNamingRules(htmlPayloads.naming),
            { verbose }
        );
        const typeSystem = timeSync(
            "Type system",
            () => parseTypeSystem(htmlPayloads.typeSystem),
            { verbose }
        );

        const payload = {
            meta: {
                manualRef: manualRef.ref,
                commitSha: manualRef.sha,
                generatedAt: new Date().toISOString(),
                source: manualRepo,
                manualPaths: { ...FEATHER_PAGES }
            },
            diagnostics,
            directives,
            namingRules,
            typeSystem
        };

        await ensureDir(path.dirname(outputPath));
        await fs.writeFile(
            outputPath,
            `${JSON.stringify(payload, undefined, 2)}\n`,
            "utf8"
        );

        console.log(`Wrote Feather metadata to ${outputPath}`);
        if (verbose.parsing) {
            console.log(`Completed in ${formatDuration(startTime)}.`);
        }
        return 0;
    } finally {
        disposeProgressBars();
    }
}

export async function runGenerateFeatherMetadataCli({
    argv = process.argv.slice(2),
    env = process.env,
    isTty = process.stdout.isTTY === true
} = {}) {
    try {
        return await main({ argv, env, isTty });
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to generate Feather metadata."
        });
        return 1;
    }
}
