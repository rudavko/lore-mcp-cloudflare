/** @implements FR-001 — Host adapter builder for tool-layer env/binding concerns. */
import { parsePositiveInteger } from "lore-mcp/wiring/runtime-value-helpers.orch.3.js";
import { readAutoUpdatesInstallState } from "./auto-updates-install-state.efct.js";
import {
	createAutoUpdatesTokenDeps,
	issueAutoUpdatesSetupToken as issueShellAutoUpdatesSetupToken,
} from "./auto-updates-token.efct.js";

function resolveBuildHash(env) {
	const candidates = [env.BUILD_HASH, env.WORKERS_CI_COMMIT_SHA, env.CF_PAGES_COMMIT_SHA];
	for (let i = 0; i < candidates.length; i++) {
		if (typeof candidates[i] === "string" && candidates[i].length > 0) {
			return candidates[i];
		}
	}
	return "unknown";
}

function resolveAutoUpdatesInstallContext(env) {
	if (typeof env.AUTO_UPDATES_REPO_FULL_NAME === "string" && env.AUTO_UPDATES_REPO_FULL_NAME.length > 0) {
		return {
			mode: "exact_repo",
			repo: env.AUTO_UPDATES_REPO_FULL_NAME,
		};
	}
	if (
		typeof env.AUTO_UPDATES_REPO_BRANCH === "string" &&
		env.AUTO_UPDATES_REPO_BRANCH.length > 0 &&
		typeof env.AUTO_UPDATES_REPO_COMMIT_SHA === "string" &&
		env.AUTO_UPDATES_REPO_COMMIT_SHA.length > 0
	) {
		return {
			mode: "workers_build_ref",
			branch: env.AUTO_UPDATES_REPO_BRANCH,
			commitSha: env.AUTO_UPDATES_REPO_COMMIT_SHA,
		};
	}
	return null;
}

function createToolsHostDeps(env, deps) {
	const accessPassphrase =
		typeof env.ACCESS_PASSPHRASE === "string" ? env.ACCESS_PASSPHRASE : "";
	return {
		db: env.DB,
		buildHash: resolveBuildHash(env),
		embeddingMaxRetries: parsePositiveInteger(env.EMBEDDING_MAX_RETRIES, 5, deps.std),
		readAutoUpdatesInstallState: async () => await readAutoUpdatesInstallState(env.DB),
		resolveAutoUpdatesInstallContext: async () => resolveAutoUpdatesInstallContext(env),
		vectorizeDeleteByIds: env.VECTORIZE_INDEX ? (ids) => env.VECTORIZE_INDEX.deleteByIds(ids) : undefined,
		issueAutoUpdatesSetupToken: (targetRepo, expiresAtMs) =>
			issueShellAutoUpdatesSetupToken(
				targetRepo,
				expiresAtMs,
				createAutoUpdatesTokenDeps(
					{
						cryptoLike: deps.cryptoLike,
						textEncoderCtor: deps.textEncoderCtor,
						textDecoderCtor: deps.textDecoderCtor,
						uint8ArrayCtor: deps.uint8ArrayCtor,
						arrayFrom: deps.std.Array.from,
						stringFromCharCode: deps.std.String.fromCharCode,
						numberIsFinite: deps.std.Number.isFinite,
						btoa: deps.std.btoa,
						atob: deps.std.atob,
						jsonStringify: deps.jsonStringify,
						jsonParse: deps.jsonParse,
						nowMs: deps.std.Date.now,
					},
					accessPassphrase,
				),
			),
	};
}

export { createToolsHostDeps, resolveAutoUpdatesInstallContext, resolveBuildHash };
