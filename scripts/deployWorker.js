import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeRepoBuildHash } from "./buildHash.js";
import { resolveTargetRepo } from "./targetRepo.js";

const wrangler = "./node_modules/.bin/wrangler";
const __dirname = dirname(fileURLToPath(import.meta.url));
const wranglerConfigPath = resolve(__dirname, "..", "wrangler.jsonc");

function runWrangler(args) {
	execFileSync(wrangler, args, {
		stdio: "inherit",
		env: process.env,
	});
}

function hasCommittedRemoteD1Id() {
	return /"database_id"\s*:/u.test(readFileSync(wranglerConfigPath, "utf8"));
}

export function buildDeployArgs(targetRepo, buildHash, extraArgs) {
	return [
		"deploy",
		"--var",
		`TARGET_REPO:${targetRepo}`,
		"--var",
		`BUILD_HASH:${buildHash}`,
		...extraArgs,
	];
}

function main(argv) {
	const targetRepo = resolveTargetRepo();
	const buildHash = computeRepoBuildHash();
	if (hasCommittedRemoteD1Id()) {
		runWrangler(["d1", "migrations", "apply", "DB", "--remote"]);
	} else {
		console.log("Skipping remote D1 migrations apply because wrangler.jsonc has no database_id.");
	}
	runWrangler(buildDeployArgs(targetRepo, buildHash, argv));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
