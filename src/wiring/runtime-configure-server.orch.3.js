/** @implements FR-001 — Top-level Lore MCP server configuration orchestration. */
import { createWiringCore } from "lore-mcp/wiring/runtime-configure-core.orch.3.js";
import { createCoreHostDeps } from "./runtime-configure-host.orch.4.js";
import { createRuntimeOps } from "./runtime-configure-runtime-ops.orch.3.js";
import { buildToolsDeps } from "lore-mcp/wiring/runtime-tools-deps.orch.3.js";
import { makeDbQuery } from "lore-mcp/wiring/runtime-surface.orch.3.js";
import { createToolsHostDeps } from "./runtime-tools-host.orch.4.js";
import { registerServerSurface } from "lore-mcp/wiring/runtime-server-registration.orch.3.js";
import {
	readAutoUpdatesInstallState,
} from "./auto-updates-install-state.efct.js";
import { resolveAutoUpdatesInstallContext } from "./runtime-tools-host.orch.4.js";

function patchEngineHelpResult(result) {
	const content = Array.isArray(result?.content) ? result.content : null;
	if (content === null) {
		return result;
	}
	for (let i = 0; i < content.length; i++) {
		const item = content[i];
		if (item?.type !== "resource" || typeof item.resource?.text !== "string") {
			continue;
		}
		try {
			const payload = JSON.parse(item.resource.text);
			if (payload?.action !== "help" || !Array.isArray(payload.actions)) {
				continue;
			}
			for (let j = 0; j < payload.actions.length; j++) {
				if (payload.actions[j]?.name === "auto_updates_status") {
					payload.actions[j].description =
						"Report current auto-update inspection limitations and install-flow behavior";
				}
				if (payload.actions[j]?.name === "enable_auto_updates") {
					payload.actions[j].description =
						"Generate a short-lived browser link for the admin install-workflow flow";
				}
			}
			item.resource.text = JSON.stringify(payload);
		} catch {
			// Leave non-JSON or unexpected payloads unchanged.
		}
	}
	return result;
}

async function handleShellAutoUpdatesStatus(toolsDeps, env) {
	const installContext = resolveAutoUpdatesInstallContext(env);
	const installState = env.DB ? await readAutoUpdatesInstallState(env.DB) : null;
	return toolsDeps.formatResult(
		installState !== null
			? "Auto-update install is recorded for a downstream deploy repo."
			: installContext !== null
				? "Auto-update install is available, but no workflow installation has been recorded yet."
				: "Auto-update install is unavailable because this deployment has no verified downstream repo context.",
		{
			action: "auto_updates_status",
			configured: installState !== null,
			target_repo: installState?.targetRepo ?? null,
			setup_mode: "one_time_browser_link",
			installation_state: installState !== null ? "recorded" : "not_installed",
			install_context_mode: installContext?.mode ?? null,
			expected_target_repo: installContext?.mode === "exact_repo" ? installContext.repo : null,
			expected_branch: installContext?.mode === "workers_build_ref" ? installContext.branch : null,
			expected_commit_sha:
				installContext?.mode === "workers_build_ref" ? installContext.commitSha : null,
			installed_at: installState?.installedAt ?? null,
			install_commit_sha: installState?.installCommitSha ?? null,
			install_commit_url: installState?.installCommitUrl ?? null,
			inspection_note:
				installState !== null
					? "Runtime records the last successful install target locally, but it does not keep a GitHub PAT and cannot continuously inspect downstream workflow drift."
					: "Runtime has no recorded successful workflow install yet.",
		},
		"knowledge://history/transactions",
	);
}

async function handleShellEnableAutoUpdates(toolsDeps, env, extra) {
	const installContext = resolveAutoUpdatesInstallContext(env);
	if (installContext === null) {
		return toolsDeps.formatResult(
			"Auto-update setup is unavailable on this deployment because the worker does not have verified deploy-repo context. Redeploy from the Deploy to Cloudflare flow or use the direct maintainer install helper.",
			{
				url: null,
				path: null,
				expires_at: null,
				expires_in_seconds: toolsDeps.autoUpdatesLinkTtlSeconds,
				target_repo: null,
				install_context_mode: null,
				available: false,
			},
		);
	}
	const issuedAtMs = toolsDeps.std.Date.now();
	const expiresAtMs = issuedAtMs + toolsDeps.autoUpdatesLinkTtlSeconds * 1000;
	const setupToken = await toolsDeps.issueAutoUpdatesSetupToken(installContext, expiresAtMs);
	const requestHeaders =
		typeof extra === "object" &&
		extra !== null &&
		typeof extra.requestInfo === "object" &&
		extra.requestInfo !== null &&
		typeof extra.requestInfo.headers === "object" &&
		extra.requestInfo.headers !== null
			? extra.requestInfo.headers
			: undefined;
	const resolvedBaseUrl = toolsDeps.resolveEnableAutoUpdatesBaseUrl(requestHeaders);
	const path = toolsDeps.buildEnableAutoUpdatesPath(setupToken);
	const url = toolsDeps.buildEnableAutoUpdatesUrl(resolvedBaseUrl, setupToken);
	const browserDestination = url !== null ? url : path;
	const expiresAt = new toolsDeps.std.Date(expiresAtMs).toISOString();
	toolsDeps.logEvent("mutation", {
		op: "enable_auto_updates",
		ok: true,
		target_repo: installContext.mode === "exact_repo" ? installContext.repo : null,
	});
	const setupInstruction =
		installContext.mode === "exact_repo"
			? "Target repo: " +
				installContext.repo +
				". Use a fine-grained GitHub PAT scoped to that repo with metadata, contents, and workflow write access."
			: "Target repo verification: use a fine-grained GitHub PAT scoped to exactly one deploy repo. The install flow will verify that repo against this deployment's recorded branch and commit before writing the workflow.";
	return toolsDeps.formatResult(
		(url !== null
			? "Open the one-time auto-updates link in your browser and enter the GitHub PAT."
			: "Open the one-time auto-updates path on this same server in your browser and enter the GitHub PAT.") +
			"\n" +
			setupInstruction +
			"\n" +
			(url !== null ? "URL: " : "Path: ") +
			browserDestination,
		{
			url,
			path,
			expires_at: expiresAt,
			expires_in_seconds: toolsDeps.autoUpdatesLinkTtlSeconds,
			target_repo: installContext.mode === "exact_repo" ? installContext.repo : null,
			install_context_mode: installContext.mode,
			expected_branch: installContext.mode === "workers_build_ref" ? installContext.branch : null,
			expected_commit_sha:
				installContext.mode === "workers_build_ref" ? installContext.commitSha : null,
			available: true,
		},
	);
}

function createServerRegistrationProxy(serverRecord, toolsDeps, env) {
	return {
		tool(name, description, schema, handler) {
			if (name !== "engine_check") {
				serverRecord.tool(name, description, schema, handler);
				return;
			}
			serverRecord.tool(name, description, schema, async (args, extra) => {
				if (args?.action === "auto_updates_status") {
					return await handleShellAutoUpdatesStatus(toolsDeps, env);
				}
				if (args?.action === "enable_auto_updates") {
					return await handleShellEnableAutoUpdates(toolsDeps, env, extra);
				}
				if (args?.action === "help") {
					return patchEngineHelpResult(await handler(args, extra));
				}
				return await handler(args, extra);
			});
		},
		resource: (...args) => serverRecord.resource(...args),
		prompt: (...args) => serverRecord.prompt(...args),
	};
}

function makeConfigureLoreServer(deps) {
	return function configureLoreServer(server, env) {
		const serverRecord = server;
		const coreHostDeps = createCoreHostDeps(env);
		const core = createWiringCore({ ...deps, ...coreHostDeps, serverRecord });
		const runtimeOps = createRuntimeOps(core, deps, env);
		const toolsHostDeps = createToolsHostDeps(env, deps);
		const toolsDeps = buildToolsDeps(core, runtimeOps, deps, toolsHostDeps);
		registerServerSurface({
			serverRecord: createServerRegistrationProxy(serverRecord, toolsDeps, env),
			core,
			toolsDeps,
			deps,
			dbQuery: makeDbQuery(toolsHostDeps.db),
		});
	};
}

export { makeConfigureLoreServer };
