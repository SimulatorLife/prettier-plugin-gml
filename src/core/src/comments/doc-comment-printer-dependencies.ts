import type { DocCommentPrinterDependencies } from "./types/doc-comment-printer-dependencies.js";

let currentDependencies: DocCommentPrinterDependencies | null = null;

export function getDocCommentPrinterDependencies(): DocCommentPrinterDependencies {
    if (!currentDependencies) {
        throw new Error(
            "Doc comment printer dependencies have not been registered."
        );
    }

    return currentDependencies;
}

export function setDocCommentPrinterDependencies(
    dependencies: DocCommentPrinterDependencies
) {
    currentDependencies = dependencies;
}

export function restoreDefaultDocCommentPrinterDependencies() {
    currentDependencies = null;
}

export type {
    DocCommentPrinterDependencies
} from "./types/doc-comment-printer-dependencies.js";
