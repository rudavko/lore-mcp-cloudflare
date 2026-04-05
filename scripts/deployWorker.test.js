/** @implements FR-001 — Deploy script must bake lore-mcp package version into APP_VERSION env. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildDeployArgs, readInstalledLorePackageVersion } from "./deployWorker.js";

const require = createRequire(import.meta.url);
const lorePackageJson = JSON.parse(readFileSync(require.resolve("lore-mcp/package.json"), "utf8"));

describe("scripts/deployWorker", () => {
	test("reads the installed lore-mcp package version", () => {
		expect(readInstalledLorePackageVersion()).toBe(lorePackageJson.version);
	});

	test("bakes APP_VERSION alongside BUILD_HASH", () => {
		expect(buildDeployArgs("build-123", "0.2.0", ["--minify"])).toEqual([
			"deploy",
			"--var",
			"BUILD_HASH:build-123",
			"--var",
			"APP_VERSION:0.2.0",
			"--minify",
		]);
	});
});
