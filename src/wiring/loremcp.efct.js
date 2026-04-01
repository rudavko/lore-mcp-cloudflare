/** @implements FR-001, ADR-0001 — Lore MCP lifecycle orchestration for init and ingestion scheduling. */
const SUMMARY_FALLBACK = "Lore knowledge store — summary unavailable.";

function resolveServerVersion(serverVersion, env) {
	return typeof serverVersion === "function" ? serverVersion(env) : serverVersion;
}

export const makeInitLoreMcp = (deps) => {
	async function initLoreMcp(instance) {
		const host = deps.createLoreMcpInstanceHost(instance);
		await deps.initSchema(host.db);
		let summary = SUMMARY_FALLBACK;
		try {
			summary = deps.formatSummary(deps.mapSummaryData(await deps.querySummaryCounts(host.db)));
		} catch {
			summary = SUMMARY_FALLBACK;
		}
		host.setServer(
			new deps.McpServerCtor({
				name: deps.serverName,
				version: resolveServerVersion(deps.serverVersion, host.env),
				instructions: summary,
			}),
		);
		if (deps.configureServer !== undefined) {
			await deps.configureServer(host.getServer(), host.env);
		}
		try {
			await host.processIngestion();
		} catch {
			// Ingestion runs in background; startup should still succeed.
		}
	}
	return initLoreMcp;
};
export const makeProcessLoreIngestion = (deps) => {
	async function processLoreIngestion(instance) {
		const host = deps.createLoreMcpInstanceHost(instance);
		let remaining;
		try {
			remaining = await deps.runIngestion(host.env, host.getServer());
		} catch {
			remaining = 1;
		}
		if (deps.shouldReschedule(remaining)) {
			await host.schedule(
				new deps.dateCtor(deps.nowMs() + deps.rescheduleDelayMs),
				"processIngestion",
			);
		}
	}
	return processLoreIngestion;
};
