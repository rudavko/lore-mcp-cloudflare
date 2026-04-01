/** @implements FR-001, FR-003 — Runtime service assembly over stable named dependency builders. */
import { makeInitLoreMcp, makeProcessLoreIngestion } from "./wiring/loremcp.efct.js";
import { createLoreMcpInstanceHost } from "./wiring/loremcp-host.orch.4.js";
import { makeConfigureLoreServer, makeRunLoreIngestion } from "./wiring/runtime.orch.1.js";
import { createRuntimeStd } from "lore-mcp/index-runtime-std.orch.3.js";
import { createConfigureLoreServerDeps } from "lore-mcp/index-runtime-configure-deps.orch.3.js";
import {
	createInitLoreMcpDeps,
	createProcessLoreIngestionDeps,
} from "lore-mcp/index-runtime-init-deps.orch.3.js";
import { createRunLoreIngestionDeps } from "lore-mcp/index-runtime-ingestion-deps.orch.3.js";

function resolveRuntimeAppVersion(env) {
	return typeof env?.APP_VERSION === "string" && env.APP_VERSION.length > 0 ? env.APP_VERSION : "unknown";
}

function createRuntimeServices(runtimeGlobal) {
	const std = createRuntimeStd(runtimeGlobal);
	const appVersion = resolveRuntimeAppVersion;
	const configureLoreServer = makeConfigureLoreServer(
		createConfigureLoreServerDeps({
			appVersion,
			runtimeGlobal,
			std,
		}),
	);
	const runIngestion = makeRunLoreIngestion(
		createRunLoreIngestionDeps({
			std,
		}),
	);
	const initLoreMcp = makeInitLoreMcp({
		...createInitLoreMcpDeps({
			appVersion,
			configureLoreServer,
			std,
		}),
		createLoreMcpInstanceHost,
	});
	const processLoreIngestion = makeProcessLoreIngestion({
		...createProcessLoreIngestionDeps(runIngestion),
		createLoreMcpInstanceHost,
	});
	return { appVersion, configureLoreServer, initLoreMcp, processLoreIngestion, runIngestion, std };
}

export { createRuntimeServices, resolveRuntimeAppVersion };
