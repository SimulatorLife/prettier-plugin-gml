export type FeatherDefaultSeverity = "warn" | "error";

export type FeatherFixability = "none" | "safe-only" | "always";

export type FeatherManifestEntry = Readonly<{
    id: string;
    ruleId: `feather/${string}`;
    defaultSeverity: FeatherDefaultSeverity;
    fixability: FeatherFixability;
    requiresProjectContext: boolean;
    fixScope: "local-only";
    messageIds: ReadonlyArray<string>;
}>;

export type FeatherManifest = Readonly<{
    schemaVersion: 1;
    entries: ReadonlyArray<FeatherManifestEntry>;
}>;

const FEATHER_IDS = Object.freeze([
    "GM1000",
    "GM1002",
    "GM1003",
    "GM1004",
    "GM1005",
    "GM1007",
    "GM1008",
    "GM1009",
    "GM1010",
    "GM1012",
    "GM1013",
    "GM1014",
    "GM1015",
    "GM1016",
    "GM1017",
    "GM1021",
    "GM1023",
    "GM1024",
    "GM1026",
    "GM1028",
    "GM1029",
    "GM1030",
    "GM1032",
    "GM1033",
    "GM1034",
    "GM1036",
    "GM1038",
    "GM1041",
    "GM1051",
    "GM1052",
    "GM1054",
    "GM1056",
    "GM1058",
    "GM1059",
    "GM1062",
    "GM1063",
    "GM1064",
    "GM1100",
    "GM2000",
    "GM2003",
    "GM2004",
    "GM2005",
    "GM2007",
    "GM2008",
    "GM2009",
    "GM2011",
    "GM2012",
    "GM2015",
    "GM2020",
    "GM2023",
    "GM2025",
    "GM2026",
    "GM2028",
    "GM2029",
    "GM2030",
    "GM2031",
    "GM2032",
    "GM2033",
    "GM2035",
    "GM2040",
    "GM2042",
    "GM2043",
    "GM2044",
    "GM2046",
    "GM2048",
    "GM2050",
    "GM2051",
    "GM2052",
    "GM2053",
    "GM2054",
    "GM2056",
    "GM2061",
    "GM2064"
]);

function toRuleId(id: string): `feather/${string}` {
    return `feather/${id.toLowerCase()}`;
}

const entries: ReadonlyArray<FeatherManifestEntry> = Object.freeze(
    FEATHER_IDS.map((id) =>
        Object.freeze({
            id,
            ruleId: toRuleId(id),
            defaultSeverity: "warn",
            fixability: "none",
            requiresProjectContext: false,
            fixScope: "local-only",
            messageIds: Object.freeze(["diagnostic", "unsafeFix", "missingProjectContext"])
        })
    )
);

export const featherManifest: FeatherManifest = Object.freeze({
    schemaVersion: 1,
    entries
});
