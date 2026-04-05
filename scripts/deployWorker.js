import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeRepoBuildHash } from "./buildHash.js";
import { resolveTargetRepo } from "./targetRepo.js";

const wrangler = "./node_modules/.bin/wrangler";
const __dirname = dirname(fileURLToPath(import.meta.url));
const wranglerConfigPath = resolve(__dirname, "..", "wrangler.jsonc");
const require = createRequire(import.meta.url);

function runWrangler(args) {
	execFileSync(wrangler, args, {
		stdio: "inherit",
		env: process.env,
	});
}

function hasCommittedRemoteD1Id() {
	return /"database_id"\s*:/u.test(readFileSync(wranglerConfigPath, "utf8"));
}

export function readInstalledLorePackageVersion() {
	const packagePath = require.resolve("lore-mcp/package.json");
	const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
	return typeof packageJson.version === "string" && packageJson.version.length > 0
		? packageJson.version
		: "unknown";
}

export function buildDeployArgs(buildHash, appVersion, extraArgs, installContext = null) {
	const args = [
		"deploy",
		"--var",
		`BUILD_HASH:${buildHash}`,
		"--var",
		`APP_VERSION:${appVersion}`,
	];
	if (installContext?.mode === "workers_build_ref") {
		args.push("--var", `AUTO_UPDATES_REPO_BRANCH:${installContext.branch}`);
		args.push("--var", `AUTO_UPDATES_REPO_COMMIT_SHA:${installContext.commitSha}`);
	}
	if (installContext?.mode === "exact_repo") {
		args.push("--var", `AUTO_UPDATES_REPO_FULL_NAME:${installContext.repo}`);
	}
	return [...args, ...extraArgs];
}

function main(argv) {
	const buildHash = computeRepoBuildHash();
	const appVersion = readInstalledLorePackageVersion();
	let installContext = null;
	if (
		typeof process.env.WORKERS_CI_BRANCH === "string" &&
		process.env.WORKERS_CI_BRANCH.length > 0 &&
		typeof process.env.WORKERS_CI_COMMIT_SHA === "string" &&
		process.env.WORKERS_CI_COMMIT_SHA.length > 0
	) {
		installContext = {
			mode: "workers_build_ref",
			branch: process.env.WORKERS_CI_BRANCH,
			commitSha: process.env.WORKERS_CI_COMMIT_SHA,
		};
	} else {
		try {
			const manualRepo = resolveTargetRepo({ log: () => {} });
			if (manualRepo) {
				installContext = {
					mode: "exact_repo",
					repo: manualRepo,
				};
			}
		} catch {
			// Leave auto-updates install unavailable when no verified deploy repo context exists.
		}
	}
	if (hasCommittedRemoteD1Id()) {
		runWrangler(["d1", "migrations", "apply", "DB", "--remote"]);
	} else {
		console.log("Skipping remote D1 migrations apply because wrangler.jsonc has no database_id.");
	}
	runWrangler(buildDeployArgs(buildHash, appVersion, argv, installContext));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
