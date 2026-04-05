/** @implements NFR-001 — Keep the shell install-workflow page aligned with core. */
import { describe, expect, test } from "bun:test";

import { renderInstallWorkflowPage as renderInstallWorkflowPageCore } from "../../../lore-mcp/src/templates/install-workflow.pure.js";
import { renderInstallWorkflowPage as renderInstallWorkflowPageShell } from "./install-workflow-page.pure.js";

describe("wiring/install-workflow-page.pure", () => {
	const baseParams = {
		setupToken: "setup-123",
		csrfToken: "csrf-456",
		defaultRepo: "owner/repo",
	};

	test("matches the core page for a fixed target repo", () => {
		expect(renderInstallWorkflowPageShell(baseParams)).toBe(
			renderInstallWorkflowPageCore(baseParams),
		);
	});

	test("matches the core page for PAT-based repository discovery", () => {
		expect(
			renderInstallWorkflowPageShell({
				...baseParams,
				defaultRepo: "",
			}),
		).toBe(
			renderInstallWorkflowPageCore({
				...baseParams,
				defaultRepo: "",
			}),
		);
	});
});
