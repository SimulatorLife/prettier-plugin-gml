import { getNodeEndIndex, getNodeStartIndex } from "../../../shared/ast-locations.js";
import { getFeatherDiagnostics } from "../../../shared/feather/metadata.js";

const FEATHER_FIX_IMPLEMENTATIONS = buildFeatherFixImplementations();
const FEATHER_DIAGNOSTIC_FIXERS = buildFeatherDiagnosticFixers();

export function getFeatherDiagnosticFixers() {
    return new Map(FEATHER_DIAGNOSTIC_FIXERS);
}

export function applyFeatherFixes(ast, { sourceText } = {}) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const appliedFixes = [];

    for (const entry of FEATHER_DIAGNOSTIC_FIXERS.values()) {
        const fixes = entry.applyFix(ast, { sourceText });

        if (Array.isArray(fixes) && fixes.length > 0) {
            appliedFixes.push(...fixes);
        }
    }

    if (appliedFixes.length > 0) {
        attachFeatherFixMetadata(ast, appliedFixes);
    }

    return ast;
}

function buildFeatherDiagnosticFixers() {
    const diagnostics = getFeatherDiagnostics();
    const registry = new Map();

    for (const diagnostic of diagnostics) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId || registry.has(diagnosticId)) {
            continue;
        }

        const applyFix = createFixerForDiagnostic(diagnostic);

        if (typeof applyFix !== "function") {
            continue;
        }

        registry.set(diagnosticId, {
            diagnostic,
            applyFix
        });
    }

    return registry;
}

function createFixerForDiagnostic(diagnostic) {
    const implementationFactory = FEATHER_FIX_IMPLEMENTATIONS.get(diagnostic?.id);

    if (typeof implementationFactory === "function") {
        const implementation = implementationFactory(diagnostic);

        if (typeof implementation === "function") {
            return (ast, context) => {
                const fixes = implementation({
                    ast,
                    sourceText: context?.sourceText
                });

                return Array.isArray(fixes) ? fixes : [];
            };
        }
    }

    return createNoOpFixer();
}

function createNoOpFixer() {
    return () => [];
}

function buildFeatherFixImplementations() {
    const registry = new Map();

    registerFeatherFixer(registry, "GM1051", (diagnostic) => ({ ast, sourceText }) =>
        removeTrailingMacroSemicolons({
            ast,
            sourceText,
            diagnostic
        })
    );

    return registry;
}

function registerFeatherFixer(registry, diagnosticId, factory) {
    if (!registry || typeof registry.set !== "function") {
        return;
    }

    if (!diagnosticId || typeof factory !== "function") {
        return;
    }

    if (!registry.has(diagnosticId)) {
        registry.set(diagnosticId, factory);
    }
}

function removeTrailingMacroSemicolons({ ast, sourceText, diagnostic }) {
    if (!diagnostic || typeof sourceText !== "string" || sourceText.length === 0) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (node.type === "MacroDeclaration") {
            const fixInfo = sanitizeMacroDeclaration(node, sourceText, diagnostic);
            if (fixInfo) {
                fixes.push(fixInfo);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function sanitizeMacroDeclaration(node, sourceText, diagnostic) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const tokens = Array.isArray(node.tokens) ? node.tokens : null;
    if (!tokens || tokens.length === 0) {
        return null;
    }

    const lastToken = tokens[tokens.length - 1];
    if (lastToken !== ";") {
        return null;
    }

    const startIndex = node.start?.index;
    const endIndex = node.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const originalText = sourceText.slice(startIndex, endIndex + 1);

    // Only strip semicolons that appear at the end of the macro definition.
    const sanitizedText = originalText.replace(/;(?=[^\S\r\n]*(?:\r?\n|$))/, "");

    if (sanitizedText === originalText) {
        return null;
    }

    node.tokens = tokens.slice(0, tokens.length - 1);
    node._featherMacroText = sanitizedText;

    const fixDetail = {
        id: diagnostic.id,
        title: diagnostic.title,
        description: diagnostic.description,
        correction: diagnostic.correction,
        target: node.name?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    };

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function attachFeatherFixMetadata(target, fixes) {
    if (!target || typeof target !== "object" || !Array.isArray(fixes) || fixes.length === 0) {
        return;
    }

    const key = "_appliedFeatherDiagnostics";

    if (!Array.isArray(target[key])) {
        Object.defineProperty(target, key, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: []
        });
    }

    target[key].push(...fixes);
}

