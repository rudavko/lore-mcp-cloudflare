/** @implements FR-001 — Release helpers must repin lore-mcp to the latest tagged upstream release. */
import { describe, expect, test } from "bun:test";

import { parseLatestLoreTag, repinLoreDependency } from "./repinLoreMcp.js";

describe("scripts/repinLoreMcp", () => {
	test("selects the highest semantic lore-mcp tag from git ls-remote output", () => {
		const latestTag = parseLatestLoreTag(`\
aaaa refs/tags/v0.1.9
bbbb refs/tags/v0.2.0
cccc refs/tags/v0.10.0
`);
		expect(latestTag).toBe("v0.10.0");
	});

	test("returns null when git ls-remote output contains no semver tags", () => {
		expect(parseLatestLoreTag("")).toBeNull();
		expect(parseLatestLoreTag("aaaa refs/tags/not-a-release")).toBeNull();
	});

	test("rewrites the lore-mcp dependency tag and preserves package formatting", () => {
		const result = repinLoreDependency(
			JSON.stringify(
				{
					name: "lore-mcp-cloudflare",
					dependencies: {
						"lore-mcp": "github:rudavko/lore-mcp#v0.2.0",
						zod: "4.3.6",
					},
				},
				null,
				2,
			) + "\n",
			"v0.3.0",
		);
		expect(result.changed).toBe(true);
		expect(result.currentTag).toBe("v0.2.0");
		expect(result.packageJsonText).toContain('"lore-mcp": "github:rudavko/lore-mcp#v0.3.0"');
		expect(result.packageJsonText.endsWith("\n")).toBe(true);
	});

	test("returns unchanged when the dependency is already pinned to the latest tag", () => {
		const packageJsonText = `{
  "dependencies": {
    "lore-mcp": "github:rudavko/lore-mcp#v0.2.0"
  }
}
`;
		const result = repinLoreDependency(packageJsonText, "v0.2.0");
		expect(result.changed).toBe(false);
		expect(result.packageJsonText).toBe(packageJsonText);
	});
});
