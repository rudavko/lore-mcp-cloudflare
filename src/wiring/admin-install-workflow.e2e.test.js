/** @implements FR-001 — Route-level e2e regression for admin install-workflow with this-sensitive runtime APIs. */
import { expect, test } from "bun:test";
import { makeDefaultHandlerFetch } from "./default-handler.orch.1.js";
import { makeInstallWorkflowToRepoRuntime } from "./github-workflow-adapter.efct.js";
import { installWorkflowToRepo } from "lore-mcp/domain/github-workflow.ops.efct.js";
import { normalizeRepoFullName, parseTargetRepo, renderWorkflowYaml } from "lore-mcp/domain/github-workflow.pure.js";
import { extractHiddenInputValue } from "../test-helpers/html-scrape.helper.js";
import { discoverDeployRepo } from "./discover-deploy-repo.efct.js";
import { registerAdminRoutes } from "./admin-routes.orch.1.js";
import { renderInstallWorkflowPage } from "./install-workflow-page.pure.js";
import {
	createDefaultHandlerDeps,
	createMemoryKv,
	HeadersCtor,
	RequestCtor,
} from "./default-handler.test-helpers.js";
import {
	applySetCookies,
	buildCookieHeader,
} from "../test-helpers/http-cookies.helper.js";

function createSensitiveBtoa() {
	return () => {
		throw new Error("injected btoa should not be called");
	};
}

function createGithubFetchApi(targetRepo, discoveredRepo = targetRepo) {
	const encodedWorkflow = globalThis.btoa(renderWorkflowYaml(targetRepo));
	function responseWith(body, status = 200) {
		const response = {
			status,
			ok: status >= 200 && status < 300,
			json: async () => body,
		};
		return response;
	}
	return async (url) => {
		if (url.endsWith("/user/repos?per_page=100&sort=updated")) {
			return responseWith(
				[{ full_name: discoveredRepo, permissions: { push: true } }],
				200,
			);
		}
		if (url.endsWith(`/repos/${targetRepo}`)) {
			return responseWith({ default_branch: "main" }, 200);
		}
		if (url.endsWith(`/repos/${targetRepo}/contents/package.json?ref=main`)) {
			return responseWith(
				{
					encoding: "base64",
					content: globalThis.btoa(
						JSON.stringify({
							name: "lore-mcp-cloudflare",
							dependencies: { "lore-mcp": "github:rudavko/lore-mcp#v0.2.0" },
						}),
					),
				},
				200,
			);
		}
		if (url.endsWith(`/repos/${targetRepo}/contents/wrangler.jsonc?ref=main`)) {
			return responseWith(
				{
					encoding: "base64",
					content: globalThis.btoa('{"name":"lore-mcp"}'),
				},
				200,
			);
		}
		if (url.endsWith(`/repos/${targetRepo}/branches/main`)) {
			return responseWith({ name: "main" }, 200);
		}
		if (url.endsWith(`/repos/${targetRepo}/compare/buildsha...main`)) {
			return responseWith({ status: "identical" }, 200);
		}
		if (
			url.endsWith(
				`/repos/${targetRepo}/contents/.github/workflows/upstream-sync.yml?ref=main`,
			)
		) {
			return responseWith(
				{
					sha: "sha-1",
					encoding: "base64",
					content: encodedWorkflow,
				},
				200,
			);
		}
		if (url.endsWith(`/repos/${targetRepo}/contents/.github/workflows/upstream-sync.yml`)) {
			return responseWith(
				{
					commit: {
						sha: "commit-sha-1",
						html_url: `https://github.com/${targetRepo}/commit/commit-sha-1`,
					},
				},
				200,
			);
		}
		return responseWith({ message: `Unhandled URL ${url}` }, 500);
	};
}

function buildHandler(targetRepo, options = {}) {
	const setupTargetRepo =
		typeof options.setupTargetRepo === "string" ? options.setupTargetRepo : targetRepo;
	const discoveredRepo =
		typeof options.discoveredRepo === "string" ? options.discoveredRepo : targetRepo;
	const workflowRuntime = makeInstallWorkflowToRepoRuntime({
		installWorkflowToRepo,
		discoverDeployRepo,
		parseTargetRepo,
		renderWorkflowYaml,
		btoa: createSensitiveBtoa(),
		githubFetchApi: createGithubFetchApi(targetRepo, discoveredRepo),
		jsonStringify: JSON.stringify,
	});
	return makeDefaultHandlerFetch(
		createDefaultHandlerDeps({
			routeRegistration: {
				registerAdminRoutes,
			},
			ui: {
				renderInstallWorkflowPage,
			},
			admin: {
				installWorkflowToRepo: workflowRuntime.installWorkflowToRepo,
				discoverDeployRepo: workflowRuntime.discoverDeployRepo,
				normalizeRepoFullName,
				readAutoUpdatesSetupToken: async (token) =>
					token === "setup-token-1"
						? {
								targetRepo: setupTargetRepo,
								expiresAtMs: Date.now() + 60_000,
								installContext:
									setupTargetRepo.length > 0
										? { mode: "exact_repo", repo: setupTargetRepo }
										: { mode: "workers_build_ref", branch: "main", commitSha: "buildsha" },
							}
						: null,
			},
		}),
	);
}

async function handlerFetchWithCookies({ handler, env, jar, path, init }) {
	const headers = new HeadersCtor(init?.headers || undefined);
	const cookieHeader = buildCookieHeader(jar);
	if (cookieHeader.length > 0) {
		headers.set("cookie", cookieHeader);
	}
	const response = await handler(
		new RequestCtor(`http://localhost${path}`, {
			...(init || {}),
			headers,
		}),
		env,
	);
	return { response, jar: applySetCookies(jar, response) };
}

test("admin install-workflow e2e succeeds even when injected btoa is this-sensitive", async () => {
	const targetRepo = "owner/repo";
	const handler = buildHandler(targetRepo);
	const env = {
		OAUTH_KV: createMemoryKv(),
		ACCESS_PASSPHRASE: "test-pass",
	};

	let jar = new Map();
	const installPage = await handlerFetchWithCookies({
		handler,
		env,
		jar,
		path: "/admin/install-workflow?setup_token=setup-token-1",
	});
	jar = installPage.jar;
	expect(installPage.response.status).toBe(200);
	const html = await installPage.response.text();
	const csrfToken = extractHiddenInputValue(html, "csrf_token");
	expect(csrfToken).toBeTruthy();

	const submit = await handlerFetchWithCookies({
		handler,
		env,
		jar,
		path: "/admin/install-workflow",
		init: {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				csrf_token: csrfToken,
				setup_token: "setup-token-1",
				github_pat: "github_pat_test",
			}).toString(),
		},
	});
	expect(submit.response.status).toBe(200);
	const submitHtml = await submit.response.text();
	expect(submitHtml).toContain("Workflow is already up to date.");
	expect(submitHtml).not.toContain("Illegal invocation");
});

test("admin install-workflow e2e verifies the repo from PAT scope and recorded build ref on the same page", async () => {
	const targetRepo = "owner/discovered-repo";
	const handler = buildHandler(targetRepo, {
		setupTargetRepo: "",
		discoveredRepo: targetRepo,
	});
	const env = {
		OAUTH_KV: createMemoryKv(),
		ACCESS_PASSPHRASE: "test-pass",
	};

	let jar = new Map();
	const installPage = await handlerFetchWithCookies({
		handler,
		env,
		jar,
		path: "/admin/install-workflow?setup_token=setup-token-1",
	});
	jar = installPage.jar;
	expect(installPage.response.status).toBe(200);
	const html = await installPage.response.text();
	expect(html).toContain("pinned to the deployed build branch and commit");
	const csrfToken = extractHiddenInputValue(html, "csrf_token");
	expect(csrfToken).toBeTruthy();

	const submit = await handlerFetchWithCookies({
		handler,
		env,
		jar,
		path: "/admin/install-workflow",
		init: {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				csrf_token: csrfToken,
				setup_token: "setup-token-1",
				github_pat: "github_pat_test",
			}).toString(),
		},
	});
	expect(submit.response.status).toBe(200);
	const submitHtml = await submit.response.text();
	expect(submitHtml).toContain("Workflow is already up to date.");
	expect(submitHtml).not.toContain("Unexpected admin install error");
});
