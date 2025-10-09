import { getNodeEndIndex, getNodeStartIndex } from "../../../shared/ast-locations.js";
import { getFeatherDiagnosticById } from "../../../shared/feather/metadata.js";

const MACRO_SEMICOLON_DIAGNOSTIC_ID = "GM1051";
const MACRO_SEMICOLON_DIAGNOSTIC = getFeatherDiagnosticById(MACRO_SEMICOLON_DIAGNOSTIC_ID);

export function applyFeatherFixes(ast, { sourceText, enableMacroSemicolonFix = true } = {}) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return ast;
    }

    const appliedFixes = [];

    if (enableMacroSemicolonFix && MACRO_SEMICOLON_DIAGNOSTIC) {
        appliedFixes.push(
            ...removeTrailingMacroSemicolons(ast, sourceText, MACRO_SEMICOLON_DIAGNOSTIC)
        );
    }

    if (appliedFixes.length > 0) {
        attachFeatherFixMetadata(ast, appliedFixes);
    }

    return ast;
}

function removeTrailingMacroSemicolons(ast, sourceText, diagnostic) {
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

