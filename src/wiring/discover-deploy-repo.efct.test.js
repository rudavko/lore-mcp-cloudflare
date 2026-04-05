/** @implements NFR-001 — Keep the shell discovery shim behavior aligned with core. */
import { describe, expect, test } from "bun:test";

import { discoverDeployRepo as discoverDeployRepoCore } from "../../../lore-mcp/src/domain/github-workflow.ops.efct.js";
import { discoverDeployRepo as discoverDeployRepoShell } from "./discover-deploy-repo.efct.js";

function createDeps(targetRepo) {
	const responses = {
		"/user/repos?per_page=100&sort=updated": {
			ok: true,
			status: 200,
			body: [{ full_name: targetRepo, permissions: { push: true } }],
		},
		["/repos/" + targetRepo]: {
			ok: true,
			status: 200,
			body: { default_branch: "main" },
		},
		["/repos/" + targetRepo + "/branches/main"]: {
			ok: true,
			status: 200,
			body: { name: "main" },
		},
		["/repos/" + targetRepo + "/compare/buildsha...main"]: {
			ok: true,
			status: 200,
			body: { status: "identical" },
		},
		["/repos/" + targetRepo + "/contents/package.json?ref=main"]: {
			ok: true,
			status: 200,
			body: {
				encoding: "base64",
				content: globalThis.btoa(
					JSON.stringify({
						name: "lore-mcp-cloudflare",
						dependencies: { "lore-mcp": "github:rudavko/lore-mcp#v0.2.0" },
					}),
				),
			},
		},
		["/repos/" + targetRepo + "/contents/wrangler.jsonc?ref=main"]: {
			ok: true,
			status: 200,
			body: { encoding: "base64", content: globalThis.btoa('{"name":"lore-mcp"}') },
		},
	};
	return {
		parseTargetRepo: (repoFullName) => {
			const [owner, repo] = repoFullName.split("/");
			return { error: null, owner, repo };
		},
		githubFetch: async (path) => responses[path],
		getBody: async (response) => response.body,
		atob: globalThis.atob,
		encodeUriComponent: encodeURIComponent,
	};
}

describe("wiring/discover-deploy-repo.efct", () => {
	test("matches the core discovery helper for deploy-build verification", async () => {
		const installContext = { mode: "workers_build_ref", branch: "main", commitSha: "buildsha" };
		const deps = createDeps("owner/deploy-repo");

		expect(await discoverDeployRepoShell("token", installContext, deps)).toEqual(
			await discoverDeployRepoCore("token", installContext, deps),
		);
	});

	test("matches the core discovery helper for exact-repo verification", async () => {
		const installContext = { mode: "exact_repo", repo: "owner/deploy-repo" };
		const deps = createDeps("owner/deploy-repo");

		expect(await discoverDeployRepoShell("token", installContext, deps)).toEqual(
			await discoverDeployRepoCore("token", installContext, deps),
		);
	});
});
