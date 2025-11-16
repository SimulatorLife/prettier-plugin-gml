// During the migration the semantic package should rely on the new core
// compatibility barrel instead of the legacy shared package alias.
// Remove this file and the 'shared' directory once all imports
// have been updated.
export * from "@gml-modules/core";
