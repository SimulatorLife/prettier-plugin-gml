import * as Core from "@gml-modules/core";

import { createDefaultGmlPluginComponents } from "./default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./plugin-component-normalizer.js";
import type {
    GmlPluginComponentBundle,
    GmlPluginComponentObserver,
    GmlPluginComponentProvider,
    ObserverOptions
} from "../plugin-types.js";

const DEFAULT_COMPONENTS = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

let currentProvider: GmlPluginComponentProvider = () => DEFAULT_COMPONENTS;
let activeGmlPluginComponents: GmlPluginComponentBundle = DEFAULT_COMPONENTS;

export const gmlPluginComponents = DEFAULT_COMPONENTS;

const componentObservers = new Set<GmlPluginComponentObserver>();

function notifyComponentObservers(): void {
    if (componentObservers.size === 0) {
        return;
    }

    const snapshot = Array.from(componentObservers);

    for (const observer of snapshot) {
        observer(activeGmlPluginComponents);
    }
}

function assignComponents(
    components: GmlPluginComponentBundle
): GmlPluginComponentBundle {
    activeGmlPluginComponents = normalizeGmlPluginComponents(components);
    notifyComponentObservers();
    return activeGmlPluginComponents;
}

export function resolveGmlPluginComponents(): GmlPluginComponentBundle {
    return activeGmlPluginComponents;
}

export function setGmlPluginComponentProvider(
    provider: unknown
): GmlPluginComponentBundle {
    const normalizedProvider = Core.Utils.assertFunction(provider, "provider", {
        errorMessage:
            "GML plugin component providers must be functions that return component maps"
    }) as GmlPluginComponentProvider;

    currentProvider = normalizedProvider;

    return assignComponents(normalizedProvider());
}

export function restoreDefaultGmlPluginComponents(): GmlPluginComponentBundle {
    currentProvider = () => DEFAULT_COMPONENTS;
    activeGmlPluginComponents = DEFAULT_COMPONENTS;
    notifyComponentObservers();
    return activeGmlPluginComponents;
}

export function getGmlPluginComponentProvider(): GmlPluginComponentProvider {
    return currentProvider;
}

const OBSERVER_ABORT_MESSAGE =
    "GML plugin component observer registration was aborted.";

const NOOP_UNSUBSCRIBE = Core.Utils.noop;

export function addGmlPluginComponentObserver(
    observer: unknown,
    options: ObserverOptions = {}
): () => void {
    const normalizedObserver = Core.Utils.assertFunction(observer, "observer", {
        errorMessage: "GML plugin component observers must be functions"
    }) as GmlPluginComponentObserver;

    let signal: AbortSignal | null;
    try {
        signal = Core.Utils.resolveAbortSignalFromOptions(options, {
            fallbackMessage: OBSERVER_ABORT_MESSAGE
        });
    } catch (error) {
        if (Core.Utils.isAbortError(error)) {
            return NOOP_UNSUBSCRIBE;
        }

        throw error;
    }

    componentObservers.add(normalizedObserver);

    if (!signal) {
        return () => {
            componentObservers.delete(normalizedObserver);
        };
    }

    const unsubscribe = () => {
        if (!componentObservers.delete(normalizedObserver)) {
            return;
        }

        signal.removeEventListener("abort", unsubscribe);
    };

    signal.addEventListener("abort", unsubscribe, { once: true });

    if (signal.aborted) {
        unsubscribe();
    }

    return unsubscribe;
}
