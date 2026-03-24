import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("lore-mcp-cloudflare bridge", () => {
	test("points at the current lore-mcp worker entrypoint", () => {
		const text = readFileSync(resolve(import.meta.dir, "index.ts"), "utf8");
		expect(text).toContain('import worker, { LoreMcp } from "../../lore-mcp/src/index.js";');
		expect(text).toContain("export default worker;");
	});
});
