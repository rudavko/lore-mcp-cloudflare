import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { normalizeRepoFullName } from "lore-mcp/domain/github-workflow.pure.js";

function missingTargetRepoError() {
	return new Error(
		"Missing manual deploy repo. Provide it explicitly via argv, MANUAL_DEPLOY_TARGET_REPO env, or git remote origin.",
	);
}

function missingTargetRepoWithCause(error) {
	const reason = error instanceof Error ? error.message : String(error);
	return new Error(
		`Missing manual deploy repo. Provide it explicitly via argv, MANUAL_DEPLOY_TARGET_REPO env, or git remote origin. Git remote inference failed: ${reason}`,
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
	const sshUrlMatch = /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/u.exec(trimmed);
	if (sshUrlMatch) {
		return normalizeRepoFullName(sshUrlMatch[1]);
	}
	return null;
}

function extractOriginRemoteUrlFromGitConfig(gitConfigText) {
	if (typeof gitConfigText !== "string") {
		return null;
	}
	const remoteOriginMatch =
		/\[remote\s+"origin"\]([\s\S]*?)(?=\n\[|$)/u.exec(gitConfigText);
	if (!remoteOriginMatch) {
		return null;
	}
	const urlMatch = /^\s*url\s*=\s*(.+)\s*$/mu.exec(remoteOriginMatch[1]);
	return urlMatch ? urlMatch[1].trim() : null;
}

function readOriginRemoteUrlFromGitConfig(cwd = process.cwd()) {
	const gitConfigPath = path.join(cwd, ".git", "config");
	const gitConfigText = readFileSync(gitConfigPath, "utf8");
	return extractOriginRemoteUrlFromGitConfig(gitConfigText);
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
			: process.env.MANUAL_DEPLOY_TARGET_REPO;
	if (envValue) {
		return normalizeRepoFullName(envValue);
	}
	const cwd = typeof options.cwd === "string" && options.cwd.length > 0 ? options.cwd : process.cwd();
	const readOriginRemoteUrlFromConfig =
		typeof options.readOriginRemoteUrlFromGitConfig === "function"
			? options.readOriginRemoteUrlFromGitConfig
			: () => readOriginRemoteUrlFromGitConfig(cwd);
	const getOriginRemoteUrl =
		typeof options.getOriginRemoteUrl === "function" ? options.getOriginRemoteUrl : readOriginRemoteUrl;
	const log = typeof options.log === "function" ? options.log : console.log;
	try {
		const remoteUrl = readOriginRemoteUrlFromConfig();
		const inferredFromConfig = extractRepoFromGitRemote(remoteUrl);
		if (inferredFromConfig) {
			log(`Inferred manual deploy repo from git remote origin: ${remoteUrl.trim()}`);
			return inferredFromConfig;
		}
	} catch {
		// Fall through to the git binary fallback when .git/config is unavailable.
	}
	let remoteUrl;
	try {
		remoteUrl = getOriginRemoteUrl();
	} catch (fallbackError) {
		throw missingTargetRepoWithCause(fallbackError);
	}
	const inferred = extractRepoFromGitRemote(remoteUrl);
	if (inferred) {
		log(`Inferred manual deploy repo from git remote origin: ${remoteUrl.trim()}`);
		return inferred;
	}
	throw missingTargetRepoError();
}

export { extractOriginRemoteUrlFromGitConfig, extractRepoFromGitRemote };
