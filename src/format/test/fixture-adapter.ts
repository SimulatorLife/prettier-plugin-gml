import { Format } from "../index.js";

export function createFormatFixtureAdapter() {
    return Object.freeze({
        workspaceName: "format",
        suiteName: "formatter fixtures",
        supports(kind: string) {
            return kind === "format";
        },
        async run({ config, inputText, runProfiledStage }) {
            const formatOptions = Format.extractProjectFormatOptions(config);
            const formatted = await runProfiledStage(
                "format",
                async () => await Format.format(inputText ?? "", formatOptions)
            );
            return {
                resultKind: "text" as const,
                outputText: formatted,
                changed: formatted !== (inputText ?? "")
            };
        }
    });
}
