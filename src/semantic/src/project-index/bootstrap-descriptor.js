import { withDefinedValue } from "../dependencies.js";

export function createProjectIndexBuildOptions({
    logger = null,
    logMetrics = false,
    projectIndexConcurrency,
    parserOverride = null
} = {}) {
    const buildOptions = {
        logger,
        logMetrics
    };

    withDefinedValue(projectIndexConcurrency, (value) => {
        buildOptions.concurrency = {
            gml: value,
            gmlParsing: value
        };
    });

    if (!parserOverride) {
        return buildOptions;
    }

    const { facade, parse } = parserOverride;

    if (facade) {
        buildOptions.gmlParserFacade = facade;
    }

    buildOptions.parseGml = parse;

    return buildOptions;
}

export function createProjectIndexDescriptor({
    projectRoot,
    cacheMaxSizeBytes,
    cacheFilePath = null,
    formatterVersion,
    pluginVersion,
    buildOptions
} = {}) {
    const descriptor = {
        projectRoot,
        cacheFilePath,
        formatterVersion,
        pluginVersion,
        buildOptions
    };

    withDefinedValue(cacheMaxSizeBytes, (value) => {
        descriptor.maxSizeBytes = value;
    });

    return descriptor;
}
