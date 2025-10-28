import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const { path: FEATHER_METADATA_PATH, loader: readBundledFeatherMetadata } =
    await (async () => {
        try {
            const cliModule = await import(
                "prettier-plugin-gml-cli/src/modules/feather/metadata.js"
            );

            return {
                path: cliModule.FEATHER_METADATA_PATH,
                loader: () => cliModule.loadBundledFeatherMetadata()
            };
        } catch {
            // The CLI owns the canonical loader, but semantic consumers still need
            // to function when the CLI package is not installed (for example when
            // the formatter is bundled independently). Fall back to resolving the
            // bundled JSON directly in that scenario.
            const FALLBACK_FEATHER_METADATA_URL = new URL(
                "../../../../resources/feather-metadata.json",
                import.meta.url
            );
            const fallbackPath = fileURLToPath(FALLBACK_FEATHER_METADATA_URL);

            return {
                path: fallbackPath,
                loader: () => require(fallbackPath)
            };
        }
    })();

export { FEATHER_METADATA_PATH };

export function loadBundledFeatherMetadata() {
    return readBundledFeatherMetadata();
}

export const GML_IDENTIFIER_METADATA_URL = new URL(
    "../../../../resources/gml-identifiers.json",
    import.meta.url
);
export const GML_IDENTIFIER_METADATA_PATH = fileURLToPath(
    GML_IDENTIFIER_METADATA_URL
);

export function loadBundledIdentifierMetadata() {
    return require(GML_IDENTIFIER_METADATA_PATH);
}
