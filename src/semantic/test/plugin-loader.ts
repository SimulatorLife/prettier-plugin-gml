import { Semantic } from "@gml-modules/semantic";

type PluginFormatOptions = Record<string, unknown>;

type PluginModule = {
    Plugin: {
        format(source: string, options?: PluginFormatOptions): Promise<string>;
    };
    configureIdentifierCaseIntegration(configuration: {
        runtime?: {
            createScopeTracker(): unknown;
            prepareIdentifierCaseEnvironment(options?: PluginFormatOptions): Promise<void>;
            teardownIdentifierCaseEnvironment(options?: PluginFormatOptions): void;
            attachIdentifierCasePlanSnapshot(ast: unknown, options?: PluginFormatOptions): void;
        };
        identifierCaseOptions?: Record<string, unknown>;
        printerServices?: {
            renameLookupService(node: unknown, options: PluginFormatOptions | null | undefined): string | null;
            applySnapshotService(snapshot: unknown, options: PluginFormatOptions | null | undefined): void;
            dryRunReportService(options: PluginFormatOptions | null | undefined): unknown;
            teardownService(options: PluginFormatOptions | null | undefined): void;
        };
    }): void;
};

let cachedPluginModule: Promise<PluginModule> | null = null;

function getPluginDistUrl(): string {
    return new URL("../../../plugin/dist/index.js", import.meta.url).href;
}

export async function getPlugin(): Promise<PluginModule["Plugin"]> {
    if (cachedPluginModule === null) {
        cachedPluginModule = import(getPluginDistUrl()).then((pluginModule) => {
            pluginModule.configureIdentifierCaseIntegration({
                runtime: {
                    createScopeTracker: () => new Semantic.SemanticScopeCoordinator(),
                    prepareIdentifierCaseEnvironment: Semantic.prepareIdentifierCaseEnvironment,
                    teardownIdentifierCaseEnvironment: Semantic.teardownIdentifierCaseEnvironment,
                    attachIdentifierCasePlanSnapshot: Semantic.attachIdentifierCasePlanSnapshot
                },
                identifierCaseOptions: Semantic.identifierCaseOptions,
                printerServices: {
                    renameLookupService: Semantic.getIdentifierCaseRenameForNode,
                    applySnapshotService: Semantic.applyIdentifierCasePlanSnapshot,
                    dryRunReportService: Semantic.maybeReportIdentifierCaseDryRun,
                    teardownService: Semantic.teardownIdentifierCaseEnvironment
                }
            });

            return pluginModule as PluginModule;
        });
    }

    const pluginModule = await cachedPluginModule;
    return pluginModule.Plugin;
}
