import { isCliRunSkipped } from "../shared/dependencies.js";

const shouldSkipCacheClear = isCliRunSkipped();

async function loadCacheClearers() {
    if (shouldSkipCacheClear) {
        return {
            clearIdentifierCaseOptionStore: () => {},
            clearIdentifierCaseDryRunContexts: () => {}
        };
    }

    const { clearIdentifierCaseOptionStore } = await import(
        "gamemaker-language-semantic/identifier-case/option-store.js"
    );
    const { clearIdentifierCaseDryRunContexts } = await import(
        "gamemaker-language-semantic/identifier-case/identifier-case-context.js"
    );

    return {
        clearIdentifierCaseOptionStore,
        clearIdentifierCaseDryRunContexts
    };
}

const cacheClearers = await loadCacheClearers();

export function clearIdentifierCaseCaches() {
    cacheClearers.clearIdentifierCaseOptionStore(null);
    cacheClearers.clearIdentifierCaseDryRunContexts();
}
