/** @implements FR-001 — The checked-in update workflow in the deploy shell must match the generated dependency-bump template. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderWorkflowYaml } from "../../lore-mcp/src/domain/github-workflow.pure.js";

const WORKFLOW_PATH = resolve(import.meta.dir, "../.github/workflows/upstream-sync.yml");

describe("checked-in upstream-sync workflow", () => {
	test("matches the generated dependency-bump workflow for the shell repo", () => {
		const checkedInWorkflow = readFileSync(WORKFLOW_PATH, "utf8");
		expect(checkedInWorkflow).toBe(renderWorkflowYaml("rudavko/lore-mcp-cloudflare"));
	});
});
