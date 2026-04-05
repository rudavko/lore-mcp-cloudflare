/** @implements NFR-001 — Verify the GitHub workflow runtime adapter reshapes parse/fetch helpers for orchestration wiring. */
import { describe, expect, test } from "bun:test";
import { makeInstallWorkflowToRepoRuntime } from "./github-workflow-adapter.efct.js";

describe("wiring/github-workflow-adapter.efct", () => {
	test("adapts parseTargetRepo and githubFetch helpers for installWorkflowToRepo", async () => {
		const fetchCalls = [];
		let injected = null;
		const workflowRuntime = makeInstallWorkflowToRepoRuntime({
			installWorkflowToRepo: async (token, targetRepo, adapterDeps) => {
				injected = adapterDeps;
				return { ok: true, token, targetRepo };
			},
			parseTargetRepo: (target) => {
				if (target === "bad") {
					return { error: "bad target" };
				}
				return { error: null, owner: "owner", repo: "repo" };
			},
			renderWorkflowYaml: (targetRepo) => `yaml:${targetRepo}`,
			jsonStringify: JSON.stringify,
			githubFetchApi: async (url, init) => {
				fetchCalls.push({ url, init });
				if (url.endsWith("/bad-json")) {
					return {
						status: 202,
						ok: true,
						json: async () => {
							throw new Error("bad json");
						},
					};
				}
				return {
					status: 201,
					ok: true,
					json: async () => ({ ok: true }),
				};
			},
		});

		const result = await workflowRuntime.installWorkflowToRepo("token", "owner/repo");

		expect(result).toEqual({ ok: true, token: "token", targetRepo: "owner/repo" });
		expect(injected.parseTargetRepo("bad")).toEqual({ error: "bad target" });
		expect(injected.parseTargetRepo("owner/repo")).toEqual({ owner: "owner", repo: "repo" });

		const fetchResult = await injected.githubFetch("/repos/owner/repo", "token", {
			method: "PUT",
			body: "{}",
		});
		expect(fetchResult).toEqual({
			status: 201,
			ok: true,
			body: { ok: true },
		});
		expect(fetchCalls[0]).toEqual({
			url: "https://api.github.com/repos/owner/repo",
			init: {
				method: "PUT",
				headers: {
					authorization: "Bearer token",
					accept: "application/vnd.github+json",
					"user-agent": "lore-mcp",
					"x-github-api-version": "2022-11-28",
					"content-type": "application/json",
				},
				body: "{}",
			},
		});

		const badJsonResult = await injected.githubFetch("/bad-json", "token");
		expect(badJsonResult).toEqual({
			status: 202,
			ok: true,
			body: null,
		});
		expect(await injected.getBody({ body: { ok: "body" } })).toEqual({ ok: "body" });
		expect(injected.renderWorkflowYaml("owner/repo")).toBe("yaml:owner/repo");
		expect(injected.btoa("yaml")).toBe("eWFtbA==");
		expect(injected.jsonStringify({ ok: true })).toBe('{"ok":true}');
	});

	test("reads response.json with the response bound as this", async () => {
		let responseRef = null;
		const workflowRuntime = makeInstallWorkflowToRepoRuntime({
			installWorkflowToRepo: async (_token, _targetRepo, adapterDeps) => {
				return await adapterDeps.githubFetch("/repos/owner/repo", "token");
			},
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			renderWorkflowYaml: (targetRepo) => `yaml:${targetRepo}`,
			jsonStringify: JSON.stringify,
			githubFetchApi: async (_url, _init) => {
				responseRef = new globalThis.Response('{"ok":true}', {
					status: 200,
					headers: { "content-type": "application/json" },
				});
				return responseRef;
			},
		});

		const result = await workflowRuntime.installWorkflowToRepo("token", "owner/repo");
		expect(responseRef).not.toBeNull();
		expect(result).toEqual({ status: 200, ok: true, body: { ok: true } });
	});

	test("encodes workflow YAML without depending on an injected btoa binding", async () => {
		let encoded = "";
		const workflowRuntime = makeInstallWorkflowToRepoRuntime({
			installWorkflowToRepo: async (_token, _targetRepo, adapterDeps) => {
				encoded = adapterDeps.btoa("name: Upstream Sync\n");
				return { ok: true };
			},
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			renderWorkflowYaml: (targetRepo) => `yaml:${targetRepo}`,
			jsonStringify: JSON.stringify,
			githubFetchApi: async () => ({
				status: 200,
				ok: true,
				json: async () => ({}),
			}),
		});

		await workflowRuntime.installWorkflowToRepo("token", "owner/repo");

		expect(encoded).toBe("bmFtZTogVXBzdHJlYW0gU3luYwo=");
	});

	test("adapts githubFetch helpers for discoverDeployRepo", async () => {
		let injected = null;
		const workflowRuntime = makeInstallWorkflowToRepoRuntime({
			installWorkflowToRepo: async () => ({ ok: true }),
			discoverDeployRepo: async (token, _installContext, adapterDeps) => {
				injected = adapterDeps;
				return { ok: true, token };
			},
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			renderWorkflowYaml: (targetRepo) => `yaml:${targetRepo}`,
			jsonStringify: JSON.stringify,
			githubFetchApi: async () => ({
				status: 200,
				ok: true,
				json: async () => ({ ok: true }),
			}),
		});

		const result = await workflowRuntime.discoverDeployRepo("token", {
			mode: "workers_build_ref",
			branch: "main",
			commitSha: "buildsha",
		});

		expect(result).toEqual({ ok: true, token: "token" });
		expect(await injected.githubFetch("/user/repos", "token")).toEqual({
			status: 200,
			ok: true,
			body: { ok: true },
		});
		expect(await injected.getBody({ body: { list: true } })).toEqual({ list: true });
	});
});
