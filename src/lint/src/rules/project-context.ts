import type { Rule } from "eslint";

import type { GmlProjectContext, GmlProjectSettings } from "../services/index.js";
import type { ProjectCapability } from "../types/index.js";

type ProjectAwareRuleInfo = Readonly<{
    requiresProjectContext: boolean;
    requiredCapabilities: ReadonlyArray<ProjectCapability>;
}>;

export type ProjectContextResolution = Readonly<{
    available: boolean;
    context: GmlProjectContext | null;
    settings: GmlProjectSettings | null;
}>;

function readProjectSettings(context: Rule.RuleContext): GmlProjectSettings | null {
    const settings = context.settings as Record<string, unknown>;
    const gmlSettings = settings.gml as Record<string, unknown> | undefined;
    const projectSettings = gmlSettings?.project;

    if (!projectSettings || typeof projectSettings !== "object") {
        return null;
    }

    const candidate = projectSettings as GmlProjectSettings;
    if (typeof candidate.getContext !== "function") {
        return null;
    }

    return candidate;
}

export function resolveProjectContextForRule(
    context: Rule.RuleContext,
    info: ProjectAwareRuleInfo
): ProjectContextResolution {
    if (!info.requiresProjectContext) {
        return Object.freeze({ available: true, context: null, settings: null });
    }

    const projectSettings = readProjectSettings(context);
    if (!projectSettings) {
        return Object.freeze({ available: false, context: null, settings: null });
    }

    const parserServices = context.sourceCode.parserServices as { gml?: { filePath?: unknown } };
    const sourcePath = parserServices.gml?.filePath;
    if (typeof sourcePath !== "string" || sourcePath.length === 0) {
        return Object.freeze({ available: false, context: null, settings: null });
    }

    const projectContext = projectSettings.getContext(sourcePath);
    if (!projectContext) {
        return Object.freeze({ available: false, context: null, settings: projectSettings });
    }

    for (const capability of info.requiredCapabilities) {
        if (!projectContext.capabilities.has(capability)) {
            return Object.freeze({ available: false, context: null, settings: projectSettings });
        }
    }

    return Object.freeze({ available: true, context: projectContext, settings: projectSettings });
}

export function reportMissingProjectContextOncePerFile(
    context: Rule.RuleContext,
    listeners: Rule.RuleListener
): Rule.RuleListener {
    let hasReported = false;

    return Object.freeze({
        ...listeners,
        Program(node: unknown) {
            if (hasReported) {
                return;
            }

            hasReported = true;
            context.report({
                node: node as never,
                messageId: "missingProjectContext"
            });
        }
    });
}
