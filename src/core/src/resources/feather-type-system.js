import { getFeatherMetadata } from "./feather-metadata.js";
import { asArray } from "../utils/array.js";
import { toTrimmedString } from "../utils/string.js";
export function buildFeatherTypeSystemInfo() {
    const metadata = getFeatherMetadata();
    const typeSystem = metadata?.typeSystem;
    const baseTypes = new Set();
    const baseTypesLowercase = new Set();
    const specifierBaseTypes = new Set();
    const entries = asArray(typeSystem?.baseTypes);
    for (const entry of entries) {
        const name = toTrimmedString(entry?.name);
        if (!name) {
            continue;
        }
        baseTypes.add(name);
        baseTypesLowercase.add(name.toLowerCase());
        const specifierExamples = asArray(entry?.specifierExamples);
        const hasDotSpecifier = specifierExamples.some((example) => {
            if (typeof example !== "string") {
                return false;
            }
            return example.trim().startsWith(".");
        });
        const description = typeof entry?.description === "string" ? entry.description : "";
        const requiresSpecifier = /requires specifiers/i.test(description) ||
            /constructor/i.test(description);
        if (hasDotSpecifier || requiresSpecifier) {
            specifierBaseTypes.add(name.toLowerCase());
        }
    }
    return {
        baseTypeNames: [...baseTypes],
        baseTypeNamesLower: baseTypesLowercase,
        specifierBaseTypeNamesLower: specifierBaseTypes
    };
}
//# sourceMappingURL=feather-type-system.js.map