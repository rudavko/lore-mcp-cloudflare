/** @implements NFR-001 — Discover and verify the deploy repo visible to a fine-grained GitHub PAT. */
function formatGitHubError(status, payload) {
	if (payload !== null && payload !== undefined && typeof payload === "object") {
		const message = typeof payload.message === "string" ? payload.message : undefined;
		const details =
			typeof payload.documentation_url === "string" ? payload.documentation_url : undefined;
		if (message && details) {
			return "GitHub API " + status + ": " + message + " (" + details + ")";
		}
		if (message) {
			return "GitHub API " + status + ": " + message;
		}
	}
	return "GitHub API " + status + ": unexpected response";
}

function canWriteWorkflow(repoData) {
	if (repoData === null || repoData === undefined || typeof repoData !== "object") {
		return false;
	}
	const permissions =
		repoData.permissions !== null &&
		repoData.permissions !== undefined &&
		typeof repoData.permissions === "object"
			? repoData.permissions
			: null;
	return Boolean(
		permissions &&
			((typeof permissions.admin === "boolean" && permissions.admin) ||
				(typeof permissions.push === "boolean" && permissions.push) ||
				(typeof permissions.maintain === "boolean" && permissions.maintain)),
	);
}

function normalizeRepoCandidate(repoData) {
	if (!canWriteWorkflow(repoData)) {
		return null;
	}
	const fullName = typeof repoData.full_name === "string" ? repoData.full_name.trim() : "";
	return fullName.length > 0 ? fullName : null;
}

function encodePathComponent(value, deps) {
	const encoder =
		typeof deps.encodeUriComponent === "function" ? deps.encodeUriComponent : encodeURIComponent;
	return encoder(value);
}

function decodeBase64Utf8(base64Text, deps) {
	const atobImpl = typeof deps.atob === "function" ? deps.atob : atob;
	try {
		return atobImpl(String(base64Text || "").replace(/\s+/gu, ""));
	} catch {
		return "";
	}
}

async function listWritablePatRepos(token, deps) {
	const response = await deps.githubFetch("/user/repos?per_page=100&sort=updated", token);
	if (!response.ok) {
		const payload = await deps.getBody(response);
		return { ok: false, error: formatGitHubError(response.status, payload) };
	}
	const repos = Array.isArray(response.body) ? response.body : null;
	if (repos === null) {
		return { ok: false, error: "GitHub API returned an unexpected repository list payload" };
	}
	const writableRepos = [];
	for (let i = 0; i < repos.length; i++) {
		const targetRepo = normalizeRepoCandidate(repos[i]);
		if (targetRepo !== null) {
			writableRepos.push(targetRepo);
		}
	}
	return { ok: true, writableRepos };
}

async function fetchRepoMetadata(token, targetRepo, deps) {
	const parsed = deps.parseTargetRepo(targetRepo);
	if (parsed.error || !parsed.owner || !parsed.repo) {
		return { ok: false, error: parsed.error || "Invalid repo format" };
	}
	const repoResponse = await deps.githubFetch("/repos/" + parsed.owner + "/" + parsed.repo, token);
	if (!repoResponse.ok) {
		const payload = await deps.getBody(repoResponse);
		return { ok: false, error: formatGitHubError(repoResponse.status, payload) };
	}
	const defaultBranch = repoResponse.body?.default_branch;
	if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
		return { ok: false, error: "Repository " + targetRepo + " returned no default_branch" };
	}
	return { ok: true, owner: parsed.owner, repo: parsed.repo, defaultBranch };
}

async function verifyRepoMatchesWorkersBuildRef(token, targetRepo, installContext, deps) {
	const parsed = deps.parseTargetRepo(targetRepo);
	if (parsed.error || !parsed.owner || !parsed.repo) {
		return { ok: false, error: parsed.error || "Invalid repo format" };
	}
	const branchPath =
		"/repos/" +
		parsed.owner +
		"/" +
		parsed.repo +
		"/branches/" +
		encodePathComponent(installContext.branch, deps);
	const branchResponse = await deps.githubFetch(branchPath, token);
	if (!branchResponse.ok) {
		const payload = await deps.getBody(branchResponse);
		return { ok: false, error: formatGitHubError(branchResponse.status, payload) };
	}
	const comparePath =
		"/repos/" +
		parsed.owner +
		"/" +
		parsed.repo +
		"/compare/" +
		encodePathComponent(installContext.commitSha + "..." + installContext.branch, deps);
	const compareResponse = await deps.githubFetch(comparePath, token);
	if (!compareResponse.ok) {
		const payload = await deps.getBody(compareResponse);
		return { ok: false, error: formatGitHubError(compareResponse.status, payload) };
	}
	const status = typeof compareResponse.body?.status === "string" ? compareResponse.body.status : "";
	if (status !== "ahead" && status !== "identical") {
		return {
			ok: false,
			error:
				"GitHub PAT repo does not match the repo that produced this deployment. Use a fine-grained PAT scoped to the Deploy to Cloudflare repo that is connected to this worker.",
		};
	}
	return { ok: true };
}

async function validateDeployRepoShape(token, targetRepo, defaultBranch, deps) {
	const parsed = deps.parseTargetRepo(targetRepo);
	if (parsed.error || !parsed.owner || !parsed.repo) {
		return { ok: false, error: parsed.error || "Invalid repo format" };
	}
	const packageResponse = await deps.githubFetch(
		"/repos/" +
			parsed.owner +
			"/" +
			parsed.repo +
			"/contents/package.json?ref=" +
			encodePathComponent(defaultBranch, deps),
		token,
	);
	if (!packageResponse.ok) {
		const payload = await deps.getBody(packageResponse);
		return {
			ok: false,
			error:
				"Deploy repo validation failed while reading package.json: " +
				formatGitHubError(packageResponse.status, payload),
		};
	}
	let packageJson;
	try {
		packageJson = JSON.parse(decodeBase64Utf8(packageResponse.body?.content, deps));
	} catch {
		return { ok: false, error: "Deploy repo validation failed: package.json is not valid JSON." };
	}
	if (typeof packageJson?.dependencies?.["lore-mcp"] !== "string") {
		return {
			ok: false,
			error:
				"Deploy repo validation failed: package.json dependencies.lore-mcp is missing.",
		};
	}
	const wranglerResponse = await deps.githubFetch(
		"/repos/" +
			parsed.owner +
			"/" +
			parsed.repo +
			"/contents/wrangler.jsonc?ref=" +
			encodePathComponent(defaultBranch, deps),
		token,
	);
	if (!wranglerResponse.ok) {
		const payload = await deps.getBody(wranglerResponse);
		return {
			ok: false,
			error:
				"Deploy repo validation failed while reading wrangler.jsonc: " +
				formatGitHubError(wranglerResponse.status, payload),
		};
	}
	return { ok: true };
}

export async function discoverDeployRepo(token, installContext, deps) {
	if (installContext === null || installContext === undefined || typeof installContext !== "object") {
		return { ok: false, error: "Install link is missing deploy-repo verification context." };
	}
	if (installContext.mode === "exact_repo") {
		const repoMeta = await fetchRepoMetadata(token, installContext.repo, deps);
		if (!repoMeta.ok) {
			return repoMeta;
		}
		const shapeCheck = await validateDeployRepoShape(
			token,
			installContext.repo,
			repoMeta.defaultBranch,
			deps,
		);
		if (!shapeCheck.ok) {
			return shapeCheck;
		}
		return { ok: true, targetRepo: installContext.repo };
	}
	if (installContext.mode !== "workers_build_ref") {
		return { ok: false, error: "Install link has an unsupported deploy-repo verification mode." };
	}
	const listed = await listWritablePatRepos(token, deps);
	if (!listed.ok) {
		return listed;
	}
	if (listed.writableRepos.length === 0) {
		return {
			ok: false,
			error:
				"Automatic repository verification found no writable GitHub repositories for this PAT. Use a fine-grained PAT scoped to exactly one deploy repo with metadata, contents, and workflow write access.",
		};
	}
	if (listed.writableRepos.length !== 1) {
		return {
			ok: false,
			error:
				"Automatic repository verification requires a fine-grained PAT scoped to exactly one writable deploy repo. Narrow the PAT and retry.",
		};
	}
	const targetRepo = listed.writableRepos[0];
	const repoMeta = await fetchRepoMetadata(token, targetRepo, deps);
	if (!repoMeta.ok) {
		return repoMeta;
	}
	const refCheck = await verifyRepoMatchesWorkersBuildRef(token, targetRepo, installContext, deps);
	if (!refCheck.ok) {
		return refCheck;
	}
	const shapeCheck = await validateDeployRepoShape(token, targetRepo, repoMeta.defaultBranch, deps);
	if (!shapeCheck.ok) {
		return shapeCheck;
	}
	return { ok: true, targetRepo };
}
