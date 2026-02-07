/**
 * Reserved identifier renaming for Feather diagnostics.
 *
 * This module handles the detection and renaming of identifiers that conflict with
 * GML reserved words and built-ins. When a user-defined variable or macro shadows
 * a reserved identifier, this module automatically renames it to avoid conflicts.
 *
 * ARCHITECTURE NOTE: This module is part of the Feather fix subsystem and now uses
 * semantic-safe rename planning provided through the plugin runtime contract.
 */

import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

import { collectIdentifierNamesFromNode, resolveSemanticSafeFeatherRename } from "./semantic-safe-renaming.js";
import { attachFeatherFixMetadata, createFeatherFixDetail } from "./utils.js";

/**
 * Options for renaming operations.
 */
export type RenameOptions = {
    /**
     * Callback invoked when an identifier is renamed.
     * Provides the renamed node, original name, and replacement name.
     */
    onRename?: (payload: { identifier: MutableGameMakerAstNode; originalName: string; replacement: string }) => void;
};

/**
 * Cached set of reserved identifier names loaded from Core.
 */
let RESERVED_IDENTIFIER_NAMES: Set<string> | null = null;

/**
 * Loads and caches the set of reserved identifier names from the Core module.
 * @returns Set of lowercase reserved identifier names.
 */
function getReservedIdentifierNames(): Set<string> {
    if (!RESERVED_IDENTIFIER_NAMES) {
        RESERVED_IDENTIFIER_NAMES = Core.loadReservedIdentifierNames();
    }
    return RESERVED_IDENTIFIER_NAMES;
}

/**
 * Renames all reserved identifiers in the AST to avoid conflicts with GML built-ins.
 *
 * This function performs a two-pass transformation:
 * 1. First pass: Find all variable and macro declarations that use reserved names,
 *    rename them, and collect the mapping of old names to new names.
 * 2. Second pass: Rename all identifier references throughout the AST based on
 *    the collected mapping.
 *
 * ARCHITECTURE NOTE: This implementation does not consult scope information,
 * which means it may not handle all edge cases correctly (e.g., shadowing in
 * nested scopes). For production-quality renaming, this logic should be
 * consolidated into the 'refactor' module which has access to semantic analysis.
 *
 * @param ast - The AST to transform
 * @param diagnostic - The Feather diagnostic that triggered this fix
 * @param sourceText - The original source text (needed for macro renaming)
 * @returns Array of fix details describing the renames that were performed
 */
export function renameReservedIdentifiers({
    ast,
    diagnostic,
    options,
    sourceText
}: {
    ast: any;
    diagnostic: any;
    options?: Record<string, unknown>;
    sourceText?: string;
}): Array<any> {
    if (!diagnostic || !ast || typeof ast !== "object" || getReservedIdentifierNames().size === 0) {
        return [];
    }

    const fixes: Array<any> = [];
    const renameMap = new Map<string, string>();
    const identifierNames = collectIdentifierNamesFromNode(ast);

    // First pass: find all declarations that need to be renamed
    const collectRenamings = (node: any): void => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                collectRenamings(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "VariableDeclaration" && isSupportedVariableDeclaration(node)) {
            const declarationFixes = renameReservedIdentifiersInVariableDeclaration(
                node,
                diagnostic,
                options,
                identifierNames,
                renameMap
            );

            if (Core.isNonEmptyArray(declarationFixes)) {
                fixes.push(...declarationFixes);
                // Collect the renamed identifiers
                for (const fix of declarationFixes) {
                    if (fix?.target && fix?.replacement) {
                        renameMap.set(fix.target, fix.replacement);
                    }
                }
            }
        } else if (node.type === "MacroDeclaration") {
            const macroFix = renameReservedIdentifierInMacro(
                node,
                diagnostic,
                options,
                sourceText,
                identifierNames,
                renameMap
            );

            if (macroFix) {
                fixes.push(macroFix);
                if (macroFix?.target && macroFix?.replacement) {
                    renameMap.set(macroFix.target, macroFix.replacement);
                }
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                collectRenamings(value);
            }
        }
    };

    collectRenamings(ast);

    // Second pass: rename all identifier usages
    if (renameMap.size > 0) {
        const renameUsages = (node: any, parent: any, property: any, grandparent: any): void => {
            if (!node) {
                return;
            }

            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) {
                    renameUsages(node[i], node, i, parent);
                }
                return;
            }

            if (typeof node !== "object") {
                return;
            }

            // Skip renaming identifiers in certain contexts
            if (shouldSkipIdentifierRenaming(node, parent, property, grandparent)) {
                return;
            }

            if (node.type === "Identifier" && node.name && renameMap.has(node.name)) {
                node.name = renameMap.get(node.name);
            }

            for (const [key, value] of Object.entries(node)) {
                if (value && typeof value === "object") {
                    renameUsages(value, node, key, parent);
                }
            }
        };

        renameUsages(ast, null, null, null);
    }

    return fixes;
}

/**
 * Determines whether an identifier should be skipped during the renaming pass.
 *
 * Certain contexts should not have their identifiers renamed, such as:
 * - Variable declarator IDs (already renamed in the first pass)
 * - Macro declaration names (already renamed in the first pass)
 * - Property names in member access expressions (e.g., `obj.property`)
 * - Enum declarations and members
 * - Function parameters (they are lexically scoped and don't conflict with globals)
 *
 * @param node - The current node being visited
 * @param parent - The parent node
 * @param property - The property name in the parent that contains this node
 * @param grandparent - The grandparent node
 * @returns True if the identifier should not be renamed
 */
function shouldSkipIdentifierRenaming(node: any, parent: any, property: any, grandparent: any): boolean {
    if (!parent) {
        return false;
    }

    // Skip renaming the identifier in a variable declarator (already renamed in first pass)
    if (parent.type === "VariableDeclarator" && property === "id") {
        return true;
    }

    // Skip renaming in macro declarations (already renamed in first pass)
    if (parent.type === "MacroDeclaration" && property === "name") {
        return true;
    }

    // Skip renaming property names in member access expressions
    if (parent.type === "MemberDotExpression" && property === "property") {
        return true;
    }

    // Skip renaming in enum declarations
    if (parent.type === "EnumDeclaration" && property === "name") {
        return true;
    }

    // Skip renaming enum member names
    if (parent.type === "EnumMember" && property === "name") {
        return true;
    }

    // Skip renaming function parameter names - they're lexically scoped and don't conflict
    // with global reserved identifiers. Function parameters can shadow global names by design.
    if (Array.isArray(parent) && grandparent && property === "params") {
        // grandparent is the function node, parent is the params array, property is "params"
        // This means we're looking at an identifier that's directly in the params array
        return true;
    }

    // Also handle the case where parent is the params array and we have a numeric index
    if (Array.isArray(parent) && typeof property === "number" && grandparent && grandparent.type) {
        // Check if grandparent is a function-like node with a params property
        const isFunctionLike =
            grandparent.type === "FunctionDeclaration" ||
            grandparent.type === "FunctionExpression" ||
            grandparent.type === "ConstructorDeclaration" ||
            grandparent.type === "StructFunctionDeclaration";

        if (isFunctionLike && grandparent.params === parent) {
            return true;
        }
    }

    return false;
}

/**
 * Checks if a variable declaration is supported for reserved identifier renaming.
 * Only `var` and `static` declarations are supported.
 *
 * @param node - The variable declaration node to check
 * @returns True if this is a `var` or `static` declaration
 */
function isSupportedVariableDeclaration(node: any): boolean {
    if (!node || node.type !== "VariableDeclaration") {
        return false;
    }

    const kind = typeof node.kind === "string" ? Core.toNormalizedLowerCaseString(node.kind) : null;

    return kind === "var" || kind === "static";
}

/**
 * Renames reserved identifiers within a VariableDeclaration node.
 *
 * Iterates through all declarators in the variable declaration and renames
 * any identifiers that conflict with reserved names.
 *
 * @param node - The VariableDeclaration node
 * @param diagnostic - The Feather diagnostic that triggered this fix
 * @returns Array of fix details for each renamed identifier
 */
function renameReservedIdentifiersInVariableDeclaration(
    node: any,
    diagnostic: any,
    options: Record<string, unknown> | undefined,
    identifierNames: Set<string>,
    renameMap: Map<string, string>
): Array<any> {
    const declarations = Core.asArray<any>(node?.declarations);

    if (declarations.length === 0) {
        return [];
    }

    const fixes: Array<any> = [];

    for (const declarator of declarations) {
        if (!declarator || declarator.type !== "VariableDeclarator") {
            continue;
        }

        const fix = renameReservedIdentifierNode(declarator.id, diagnostic, options, identifierNames, renameMap);

        if (fix) {
            fixes.push(fix);
        }
    }

    return fixes;
}

/**
 * Renames a single identifier node if it conflicts with a reserved word.
 *
 * If the identifier name is reserved, this function generates a replacement name,
 * updates the node, attaches fix metadata, and optionally invokes a callback.
 *
 * @param identifier - The identifier node to potentially rename
 * @param diagnostic - The Feather diagnostic that triggered this fix
 * @param options - Optional rename options (e.g., callback)
 * @returns Fix detail if the identifier was renamed, null otherwise
 */
function renameReservedIdentifierNode(
    identifier: any,
    diagnostic: any,
    formattingOptions: Record<string, unknown> | undefined,
    identifierNames: Set<string>,
    renameMap: Map<string, string>,
    options: RenameOptions = {}
): any {
    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    const name = identifier.name;

    if (!isReservedIdentifier(name)) {
        return null;
    }

    const mappedReplacementName = renameMap.get(name) ?? null;
    const replacement =
        mappedReplacementName ??
        resolveSemanticSafeFeatherRename({
            formattingOptions,
            identifierName: name,
            localIdentifierNames: identifierNames,
            preferredReplacementName: getReplacementIdentifierName(name)
        })?.replacementName;

    if (!replacement || replacement === name) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: name ?? null,
        range: {
            start: Core.getNodeStartIndex(identifier),
            end: Core.getNodeEndIndex(identifier)
        }
    });

    if (!fixDetail) {
        return null;
    }

    // Add the replacement name to the fix detail so it can be collected
    fixDetail.replacement = replacement;

    identifier.name = replacement;
    identifierNames.add(replacement);

    if (typeof options.onRename === "function") {
        try {
            options.onRename({
                identifier,
                originalName: name,
                replacement
            });
        } catch {
            // Swallow callback errors to avoid interrupting the fix pipeline.
        }
    }

    attachFeatherFixMetadata(identifier, [fixDetail]);

    return fixDetail;
}

/**
 * Renames a reserved identifier in a macro declaration, updating the macro's text.
 *
 * SPECIAL CASE: Macros require additional handling because their body is stored as
 * unparsed text rather than an AST. When renaming a macro identifier, we must also
 * update the macro text to reflect the new name.
 *
 * @param node - The MacroDeclaration node
 * @param diagnostic - The Feather diagnostic that triggered this fix
 * @param sourceText - The original source text (needed to extract macro text)
 * @returns Fix detail if the macro was renamed, null otherwise
 */
function renameReservedIdentifierInMacro(
    node: any,
    diagnostic: any,
    formattingOptions: Record<string, unknown> | undefined,
    sourceText: string | undefined,
    identifierNames: Set<string>,
    renameMap: Map<string, string>
): any {
    if (!node || node.type !== "MacroDeclaration") {
        return null;
    }

    return renameReservedIdentifierNode(node.name, diagnostic, formattingOptions, identifierNames, renameMap, {
        onRename: ({ originalName, replacement }) => {
            const updatedText = buildMacroReplacementText({
                macro: node,
                originalName,
                replacement,
                sourceText
            });

            if (typeof updatedText === "string") {
                node._featherMacroText = updatedText;
            }
        }
    });
}

/**
 * Checks whether a given identifier name is a GML reserved word or built-in.
 *
 * This function checks if an identifier conflicts with GML built-ins, BUT it
 * only returns true for EXACT case matches. If the identifier differs only in case
 * from a reserved name (e.g., "color" vs "Color"), it's allowed because:
 * 1. PascalCase names in the metadata are often type annotations (Color, Array, etc.)
 * 2. Users can legitimately use lowercase versions as variable names
 * 3. Actual GML functions use snake_case (draw_text, show_debug_message)
 *
 * @param name - The identifier name to check
 * @returns True if the name is a reserved identifier (exact case match)
 */
function isReservedIdentifier(name: any): boolean {
    if (typeof name !== "string" || name.length === 0) {
        return false;
    }

    const lowerName = name.toLowerCase();

    // First check if the lowercase version is in the reserved set
    if (!getReservedIdentifierNames().has(lowerName)) {
        return false;
    }

    // If it is, we need to check if there's an exact case match in the original metadata
    // to avoid false positives where "color" matches "Color" (a type annotation)
    return hasExactCaseMatch(name);
}

/**
 * Checks if an identifier has an exact case match in the GML identifier metadata.
 * This prevents false positives where lowercase user variables (e.g., "color")
 * match PascalCase type annotations (e.g., "Color") after case-insensitive comparison.
 *
 * @param name - The identifier name to check
 * @returns True if there's an exact case match in the metadata
 */
function hasExactCaseMatch(name: string): boolean {
    if (typeof name !== "string" || name.length === 0) {
        return false;
    }

    try {
        const metadata = Core.getIdentifierMetadata();
        if (!metadata || typeof metadata !== "object") {
            // If we can't load metadata, fall back to conservative behavior
            // (don't rename unless we're sure)
            return false;
        }

        const identifiers = metadata.identifiers;
        if (!identifiers || typeof identifiers !== "object") {
            return false;
        }

        // Check if there's an exact case match in the original metadata
        return Object.hasOwn(identifiers, name);
    } catch {
        // On any error, be conservative and don't rename
        return false;
    }
}

/**
 * Generates a replacement identifier name for a reserved identifier.
 *
 * The replacement is prefixed with `__featherFix_` and additional underscores
 * are added if the generated name itself is also reserved (which should be rare).
 *
 * @param originalName - The original reserved identifier name
 * @returns A non-reserved replacement name, or null if one cannot be generated
 */
function getReplacementIdentifierName(originalName: any): string | null {
    if (typeof originalName !== "string" || originalName.length === 0) {
        return null;
    }

    let candidate = `__featherFix_${originalName}`;
    const seen = new Set<string>();

    while (isReservedIdentifier(candidate)) {
        if (seen.has(candidate)) {
            return null;
        }

        seen.add(candidate);
        candidate = `_${candidate}`;
    }

    return candidate;
}

/**
 * Builds the replacement text for a macro declaration with a renamed identifier.
 *
 * This function extracts the macro's text and performs a word-boundary replacement
 * of the original identifier with the new name.
 *
 * @param macro - The MacroDeclaration node
 * @param originalName - The original identifier name
 * @param replacement - The new identifier name
 * @param sourceText - The original source text
 * @returns The updated macro text, or null if replacement failed
 */
function buildMacroReplacementText({
    macro,
    originalName,
    replacement,
    sourceText
}: {
    macro: any;
    originalName: any;
    replacement: any;
    sourceText: any;
}): string | null {
    if (!macro || macro.type !== "MacroDeclaration" || typeof replacement !== "string") {
        return null;
    }

    const baseText = getMacroBaseText(macro, sourceText);

    if (!Core.isNonEmptyString(baseText)) {
        return null;
    }

    if (Core.isNonEmptyString(originalName)) {
        // Use a regular expression with word boundaries to avoid partial matches during renaming.
        // We use the 'g' flag even though macros usually only contain the name once in the
        // declaration header, as macros are text-based and could potentially reference
        // themselves or others in a way that requires global replacement within the line.
        const escapedName = Core.escapeRegExp(originalName);
        const regex = new RegExp(String.raw`\b${escapedName}\b`, "g");

        if (regex.test(baseText)) {
            return baseText.replace(regex, replacement);
        }
    }

    return null;
}

/**
 * Extracts the text of a macro declaration from either the cached property
 * or the original source text.
 *
 * @param macro - The MacroDeclaration node
 * @param sourceText - The original source text
 * @returns The macro text, or null if it cannot be extracted
 */
function getMacroBaseText(macro: any, sourceText: any): string | null {
    if (!macro || macro.type !== "MacroDeclaration") {
        return null;
    }

    if (Core.isNonEmptyString(macro._featherMacroText)) {
        return macro._featherMacroText;
    }

    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return null;
    }

    const startIndex = Core.getNodeStartIndex(macro);
    const endIndex = Core.getNodeEndIndex(macro);

    if (typeof startIndex !== "number" || typeof endIndex !== "number" || endIndex < startIndex) {
        return null;
    }

    return sourceText.slice(startIndex, endIndex);
}
