/** @implements FR-001 — Verify shell runtime services use lore-mcp package.json version baked into env as the sole runtime version source. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createRuntimeServices } from "./index-runtime-services.orch.2.js";

const require = createRequire(import.meta.url);
const lorePackageJson = JSON.parse(readFileSync(require.resolve("lore-mcp/package.json"), "utf8"));

describe("index-runtime-services", () => {
	test("uses env APP_VERSION baked from lore-mcp package.json as the runtime version source of truth", () => {
		const services = createRuntimeServices(globalThis);
		expect(services.appVersion({ APP_VERSION: lorePackageJson.version })).toBe(lorePackageJson.version);
		expect(services.appVersion({})).toBe("unknown");
	});
});
