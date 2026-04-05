/** @implements NFR-001 — Verify deploy-time target repo resolution helpers. */
import { describe, expect, test } from "bun:test";

import {
	extractOriginRemoteUrlFromGitConfig,
	extractRepoFromGitRemote,
	resolveTargetRepo,
} from "./targetRepo.js";

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
		const logs = [];
		expect(
			resolveTargetRepo({
				readOriginRemoteUrlFromGitConfig: () => {
					throw new Error("ENOENT: no such file or directory");
				},
				getOriginRemoteUrl: () => "https://github.com/foundry/deploy-repo.git",
				log: (message) => logs.push(message),
			}),
		).toBe("foundry/deploy-repo");
		expect(logs).toEqual([
			"Inferred manual deploy repo from git remote origin: https://github.com/foundry/deploy-repo.git",
		]);
	});

	test("prefers .git/config origin over git exec fallback", () => {
		const logs = [];
		expect(
			resolveTargetRepo({
				readOriginRemoteUrlFromGitConfig: () => "git@github.com:foundry/deploy-repo.git",
				getOriginRemoteUrl: () => "https://github.com/foundry/other-repo.git",
				log: (message) => logs.push(message),
			}),
		).toBe("foundry/deploy-repo");
		expect(logs).toEqual([
			"Inferred manual deploy repo from git remote origin: git@github.com:foundry/deploy-repo.git",
		]);
	});

	test("falls back to git exec when .git/config origin is present but not parseable as a GitHub repo", () => {
		expect(
			resolveTargetRepo({
				readOriginRemoteUrlFromGitConfig: () => "https://example.com/not-github/repo.git",
				getOriginRemoteUrl: () => "https://github.com/foundry/deploy-repo.git",
			}),
		).toBe("foundry/deploy-repo");
	});

	test("extracts remote origin url from .git/config text", () => {
		expect(
			extractOriginRemoteUrlFromGitConfig(`[core]
	repositoryformatversion = 0
[remote "origin"]
	url = https://github.com/foundry/deploy-repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
`),
		).toBe("https://github.com/foundry/deploy-repo.git");
	});

	test("extracts owner/repo from GitHub ssh and https remotes", () => {
		expect(extractRepoFromGitRemote("git@github.com:owner/repo.git")).toBe("owner/repo");
		expect(extractRepoFromGitRemote("https://github.com/owner/repo.git")).toBe("owner/repo");
		expect(extractRepoFromGitRemote("ssh://git@github.com/owner/repo.git")).toBe("owner/repo");
	});

	test("throws when argv, env, and git remote origin are all unavailable", () => {
		expect(() =>
			resolveTargetRepo({
				readOriginRemoteUrlFromGitConfig: () => {
					throw new Error("ENOENT: no such file or directory");
				},
				getOriginRemoteUrl: () => "https://example.com/not-github/repo.git",
			}),
		).toThrow(
			"Missing manual deploy repo. Provide it explicitly via argv, MANUAL_DEPLOY_TARGET_REPO env, or git remote origin.",
		);
	});

	test("includes the git error when origin lookup throws", () => {
		expect(() =>
			resolveTargetRepo({
				readOriginRemoteUrlFromGitConfig: () => {
					throw new Error("ENOENT: no such file or directory");
				},
				getOriginRemoteUrl: () => {
					throw new Error("spawn git ENOENT");
				},
			}),
		).toThrow(
			"Missing manual deploy repo. Provide it explicitly via argv, MANUAL_DEPLOY_TARGET_REPO env, or git remote origin. Git remote inference failed: spawn git ENOENT",
		);
	});
});
