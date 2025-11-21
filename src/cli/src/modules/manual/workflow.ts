import {
    describeManualSource,
    ManualSourceDescriptor,
    ManualSourceResolver,
    resolveManualSource
} from "./source.js";
import {
    createWorkflowPathFilter,
    ensureManualWorkflowArtifactsAllowed,
    WorkflowPathFilter,
    WorkflowPathFilterOptions
} from "../../workflow/path-filter.js";

const DEFAULT_MESSAGE_FORMATTER = ({ manualSourceDescription }) =>
    `Using manual assets from ${manualSourceDescription}.`;

export interface ManualWorkflowOptions {
    workflow?: WorkflowPathFilterOptions;
    outputPath?: string | null;
    manualRoot?: string | null;
    manualPackage?: string | null;
    quiet?: boolean;
    log?: (message: string) => void;
    formatManualSourceMessage?: (context: {
        manualSource: ManualSourceDescriptor;
        manualSourceDescription: string;
    }) => string | null | undefined;
    manualSourceResolver?: ManualSourceResolver;
    manualSourceDescriber?: (source: ManualSourceDescriptor) => string;
}

export interface ManualWorkflowResult {
    workflowPathFilter: WorkflowPathFilter;
    manualSource: ManualSourceDescriptor;
}

/**
 * Prepare manual workflow state shared by metadata and identifier generators.
 *
 * Consolidates the repeated ceremony around building workflow path filters,
 * validating manual output destinations, resolving manual assets, and logging
 * the active manual source. Both manual-driven CLI commands previously
 * duplicated this sequence which made it easier to accidentally drift the
 * validation or logging behaviour between them.
 *
 * @param {{
 *   workflow?: Parameters<typeof createWorkflowPathFilter>[0],
 *   outputPath?: string | null,
 *   manualRoot?: string | null,
 *   manualPackage?: string | null,
 *   quiet?: boolean,
 *   log?: (message: string) => void,
 *   formatManualSourceMessage?: (context: {
 *     manualSource: Awaited<ReturnType<typeof resolveManualSource>>,
 *     manualSourceDescription: string
 *   }) => string | null | undefined
 * }} [options]
 * @returns {Promise<{
 *   workflowPathFilter: ReturnType<typeof createWorkflowPathFilter>,
 *   manualSource: Awaited<ReturnType<typeof resolveManualSource>>
 * }>}
 */
export async function prepareManualWorkflow({
    workflow,
    outputPath,
    manualRoot,
    manualPackage,
    quiet = false,
    log = console.log,
    formatManualSourceMessage = DEFAULT_MESSAGE_FORMATTER,
    manualSourceResolver = resolveManualSource,
    manualSourceDescriber = describeManualSource
}: ManualWorkflowOptions = {}): Promise<ManualWorkflowResult> {
    const workflowPathFilter = createWorkflowPathFilter(workflow);

    ensureManualWorkflowArtifactsAllowed(workflowPathFilter, {
        outputPath
    });

    const manualSource = await manualSourceResolver({
        manualRoot,
        manualPackage
    });

    if (!quiet) {
        const manualSourceDescription = manualSourceDescriber(manualSource);
        const message = formatManualSourceMessage({
            manualSource,
            manualSourceDescription
        });

        if (
            typeof message === "string" &&
            message.length > 0 &&
            typeof log === "function"
        ) {
            log(message);
        }
    }

    return { workflowPathFilter, manualSource };
}
