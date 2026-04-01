/** @implements NFR-001 — Verify deploy-time target repo resolution helpers. */
import { describe, expect, test } from "bun:test";

import { extractRepoFromGitRemote, resolveTargetRepo } from "./targetRepo.js";

describe("scripts/targetRepo", () => {
	test("prefers explicit args over env", () => {
		expect(
			resolveTargetRepo({
				explicitArg: "arg-owner/arg-repo",
				envTargetRepo: "env-owner/env-repo",
			}),
		).toBe("arg-owner/arg-repo");
	});

	test("uses env override when present", () => {
		expect(resolveTargetRepo({ envTargetRepo: "env-owner/env-repo" })).toBe(
			"env-owner/env-repo",
		);
	});

	test("falls back to git remote origin when argv and env are absent", () => {
		expect(
			resolveTargetRepo({
				getOriginRemoteUrl: () => "https://github.com/foundry/deploy-repo.git",
			}),
		).toBe("foundry/deploy-repo");
	});

	test("extracts owner/repo from GitHub ssh and https remotes", () => {
		expect(extractRepoFromGitRemote("git@github.com:owner/repo.git")).toBe("owner/repo");
		expect(extractRepoFromGitRemote("https://github.com/owner/repo.git")).toBe("owner/repo");
	});

	test("throws when argv, env, and git remote origin are all unavailable", () => {
		expect(() =>
			resolveTargetRepo({
				getOriginRemoteUrl: () => "https://example.com/not-github/repo.git",
			}),
		).toThrow(
			"Missing TARGET_REPO. Provide the downstream deploy repo explicitly via argv, TARGET_REPO env, or git remote origin.",
		);
	});
});
