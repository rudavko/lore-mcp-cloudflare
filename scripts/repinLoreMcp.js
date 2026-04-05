import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLOUD_PACKAGE_JSON_PATH = resolve(__dirname, "..", "package.json");
const CLOUD_REPO_DIR = resolve(__dirname, "..");
const UPSTREAM_TAGS_REMOTE = "https://github.com/rudavko/lore-mcp.git";

export function parseLatestLoreTag(lsRemoteOutput) {
	const tagNames = lsRemoteOutput
		.split("\n")
		.map((line) => {
			const parts = line.trim().split(/\s+/u);
			if (parts.length < 2) {
				return "";
			}
			const ref = parts[1];
			const prefix = "refs/tags/";
			return ref.startsWith(prefix) ? ref.slice(prefix.length) : "";
		})
		.filter((tag) => /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(tag))
		.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
	return tagNames.length > 0 ? tagNames[tagNames.length - 1] : null;
}

export function repinLoreDependency(packageJsonText, nextTag) {
	const packageJson = JSON.parse(packageJsonText);
	const currentDependency = packageJson.dependencies?.["lore-mcp"];
	if (typeof currentDependency !== "string" || currentDependency.length === 0) {
		throw new Error("package.json dependencies.lore-mcp is missing");
	}
	const currentTagMatch = currentDependency.match(/#(v[^\s]+)$/u);
	const currentTag = currentTagMatch ? currentTagMatch[1] : null;
	const nextDependency = currentDependency.includes("#")
		? currentDependency.replace(/#.+$/u, `#${nextTag}`)
		: `${currentDependency}#${nextTag}`;
	if (nextDependency === currentDependency) {
		return { changed: false, currentTag, nextTag, packageJsonText };
	}
	packageJson.dependencies["lore-mcp"] = nextDependency;
	return {
		changed: true,
		currentTag,
		nextTag,
		packageJsonText: JSON.stringify(packageJson, null, 2) + "\n",
	};
}

function resolveLatestLoreTag() {
	const output = execFileSync(
		"git",
		["ls-remote", "--tags", "--refs", UPSTREAM_TAGS_REMOTE, "v*"],
		{ encoding: "utf8" },
	);
	const latestTag = parseLatestLoreTag(output);
	if (latestTag === null) {
		throw new Error(`No upstream lore-mcp tags found at ${UPSTREAM_TAGS_REMOTE}`);
	}
	return latestTag;
}

function readRequestedTag(argv) {
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--tag" && typeof argv[i + 1] === "string" && argv[i + 1].length > 0) {
			return argv[i + 1];
		}
	}
	return null;
}

function main() {
	const latestTag = readRequestedTag(process.argv.slice(2)) || resolveLatestLoreTag();
	const currentPackageJsonText = readFileSync(CLOUD_PACKAGE_JSON_PATH, "utf8");
	const result = repinLoreDependency(currentPackageJsonText, latestTag);
	if (!result.changed) {
		console.log(`lore-mcp is already pinned to ${latestTag}`);
		return;
	}
	writeFileSync(CLOUD_PACKAGE_JSON_PATH, result.packageJsonText, "utf8");
	execFileSync("bun", ["install"], {
		cwd: CLOUD_REPO_DIR,
		stdio: "inherit",
	});
	console.log(
		`Repinned lore-mcp from ${result.currentTag || "unknown"} to ${latestTag} in package.json and bun.lock`,
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
