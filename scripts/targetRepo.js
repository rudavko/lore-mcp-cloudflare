import { execFileSync } from "node:child_process";

import { normalizeRepoFullName } from "lore-mcp/domain/github-workflow.pure.js";

function missingTargetRepoError() {
	return new Error(
		"Missing TARGET_REPO. Provide the downstream deploy repo explicitly via argv, TARGET_REPO env, or git remote origin.",
	);
}

function extractRepoFromGitRemote(remoteUrl) {
	if (typeof remoteUrl !== "string") {
		return null;
	}
	const trimmed = remoteUrl.trim();
	const sshMatch = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/u.exec(trimmed);
	if (sshMatch) {
		return normalizeRepoFullName(sshMatch[1]);
	}
	const httpsMatch = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/u.exec(trimmed);
	if (httpsMatch) {
		return normalizeRepoFullName(httpsMatch[1]);
	}
	return null;
}

function readOriginRemoteUrl() {
	return execFileSync("git", ["remote", "get-url", "origin"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
}

export function resolveTargetRepo(options = {}) {
	const explicit = options.explicitArg;
	if (typeof explicit === "string" && explicit.length > 0) {
		return normalizeRepoFullName(explicit);
	}
	const envValue =
		typeof options.envTargetRepo === "string" && options.envTargetRepo.length > 0
			? options.envTargetRepo
			: process.env.TARGET_REPO;
	if (envValue) {
		return normalizeRepoFullName(envValue);
	}
	const getOriginRemoteUrl =
		typeof options.getOriginRemoteUrl === "function" ? options.getOriginRemoteUrl : readOriginRemoteUrl;
	const inferred = extractRepoFromGitRemote(getOriginRemoteUrl());
	if (inferred) {
		return inferred;
	}
	throw missingTargetRepoError();
}

export { extractRepoFromGitRemote };
