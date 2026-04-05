/** @implements NFR-001 — Keep the shell install-workflow admin routes aligned with core. */
import { describe, expect, test } from "bun:test";

import { registerAdminRoutes as registerAdminRoutesCore } from "../../../lore-mcp/src/admin.orch.1.js";
import { renderInstallWorkflowPage as renderInstallWorkflowPageCore } from "../../../lore-mcp/src/templates/install-workflow.pure.js";
import { registerAdminRoutes as registerAdminRoutesShell } from "./admin-routes.orch.1.js";
import { renderInstallWorkflowPage as renderInstallWorkflowPageShell } from "./install-workflow-page.pure.js";

function createHarness(registerAdminRoutesImpl, renderInstallWorkflowPageImpl, options = {}) {
	const cookies = new Map();
	let currentBody = {};
	let currentQuery = {};
	const routes = { get: new Map(), post: new Map() };
	const usedTokens = new Map();
	registerAdminRoutesImpl(
		{
			get: (path, handler) => {
				routes.get.set(path, handler);
			},
			post: (path, handler) => {
				routes.post.set(path, handler);
			},
		},
		{
			kvGet: async (key) => (usedTokens.has(key) ? usedTokens.get(key) : null),
			kvPut: async (key, value) => {
				usedTokens.set(key, value);
			},
			kvDelete: async () => {},
			setCookie: (name, value) => {
				cookies.set(name, value);
			},
			getCookie: (name) => cookies.get(name) || "",
			randomToken: () => "csrf-token-1",
			safeStringEqual: async (left, right) => left === right,
			bodyString: (value) => (typeof value === "string" ? value : ""),
			isIpLocked: async () => false,
			clearAuthFailures: async () => {},
			discoverDeployRepo:
				options.discoverDeployRepo ||
				(async () => ({ ok: true, targetRepo: "owner/discovered-repo" })),
			installWorkflowToRepo:
				options.installWorkflowToRepo ||
				(async () => ({ ok: true, action: "unchanged" })),
			normalizeRepoFullName: (value) => (typeof value === "string" ? value.trim() : ""),
			renderInstallWorkflowPage: renderInstallWorkflowPageImpl,
			readAutoUpdatesSetupToken:
				options.readAutoUpdatesSetupToken ||
				(async (token) =>
					token === "setup-token-1" ? { targetRepo: "", expiresAtMs: 61_000 } : null),
			parseBody: async () => currentBody,
			queryParam: (name) => currentQuery[name] || "",
			htmlResponse: (body, status = 200) => ({ status, body }),
			textResponse: (body, status = 200) => ({ status, body }),
			nowMs: () => 1_000,
		},
	);
	return {
		routes,
		setBody: (body) => {
			currentBody = body;
		},
		setQuery: (query) => {
			currentQuery = query;
		},
	};
}

describe("wiring/admin-routes parity", () => {
	test("matches the core GET install page for discovery-mode setup links", async () => {
		const coreHarness = createHarness(
			registerAdminRoutesCore,
			renderInstallWorkflowPageCore,
		);
		const shellHarness = createHarness(
			registerAdminRoutesShell,
			renderInstallWorkflowPageShell,
		);

		coreHarness.setQuery({ setup_token: "setup-token-1" });
		shellHarness.setQuery({ setup_token: "setup-token-1" });

		const coreResponse = await coreHarness.routes.get.get("/install-workflow")();
		const shellResponse = await shellHarness.routes.get.get("/install-workflow")();

		expect(shellResponse).toEqual(coreResponse);
	});

	test("matches the core POST install behavior when discovery succeeds", async () => {
		const coreHarness = createHarness(
			registerAdminRoutesCore,
			renderInstallWorkflowPageCore,
		);
		const shellHarness = createHarness(
			registerAdminRoutesShell,
			renderInstallWorkflowPageShell,
		);

		coreHarness.setQuery({ setup_token: "setup-token-1" });
		shellHarness.setQuery({ setup_token: "setup-token-1" });
		await coreHarness.routes.get.get("/install-workflow")();
		await shellHarness.routes.get.get("/install-workflow")();

		const body = {
			csrf_token: "csrf-token-1",
			setup_token: "setup-token-1",
			github_pat: "github_pat_test",
		};
		coreHarness.setBody(body);
		shellHarness.setBody(body);

		const coreResponse = await coreHarness.routes.post.get("/install-workflow")();
		const shellResponse = await shellHarness.routes.post.get("/install-workflow")();

		expect(shellResponse).toEqual(coreResponse);
	});
});
