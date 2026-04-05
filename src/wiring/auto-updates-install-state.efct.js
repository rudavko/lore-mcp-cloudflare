/** @implements NFR-001 — D1-backed state for atomic auto-update setup claims and recorded installs. */
const AUTO_UPDATES_USED_PREFIX = "ks:auto_updates_used:";

function usedSetupTokenKey(setupToken) {
	if (typeof setupToken !== "string" || setupToken.length === 0) {
		return AUTO_UPDATES_USED_PREFIX;
	}
	const firstDot = setupToken.indexOf(".");
	if (
		firstDot > 0 &&
		firstDot < setupToken.length - 1 &&
		setupToken.indexOf(".", firstDot + 1) === -1
	) {
		return AUTO_UPDATES_USED_PREFIX + "sig:" + setupToken.slice(firstDot + 1);
	}
	return AUTO_UPDATES_USED_PREFIX + "raw:" + setupToken;
}

function nowIso(nowMs) {
	return new Date(nowMs).toISOString();
}

function hasDb(db) {
	return db !== null && db !== undefined && typeof db.prepare === "function";
}

export async function isAutoUpdatesSetupTokenConsumed(db, setupToken) {
	if (!hasDb(db)) {
		return false;
	}
	const row = await db
		.prepare(`SELECT status FROM auto_updates_setup_claims WHERE setup_key = ? LIMIT 1`)
		.bind(usedSetupTokenKey(setupToken))
		.first();
	return row !== null && row !== undefined;
}

export async function claimAutoUpdatesSetupToken(db, setupToken, expiresAtMs, claimId, nowMsValue) {
	if (!hasDb(db)) {
		return { ok: true, claimId };
	}
	try {
		await db
			.prepare(`INSERT INTO auto_updates_setup_claims (
				setup_key,
				claim_id,
				status,
				expires_at_ms,
				created_at,
				updated_at
			) VALUES (?, ?, 'claimed', ?, ?, ?)`)
			.bind(
				usedSetupTokenKey(setupToken),
				claimId,
				expiresAtMs,
				nowIso(nowMsValue),
				nowIso(nowMsValue),
			)
			.run();
		return { ok: true, claimId };
	} catch {
		return { ok: false, error: "already_used" };
	}
}

export async function releaseAutoUpdatesSetupTokenClaim(db, setupToken, claimId) {
	if (!hasDb(db)) {
		return;
	}
	await db
		.prepare(`DELETE FROM auto_updates_setup_claims WHERE setup_key = ? AND claim_id = ?`)
		.bind(usedSetupTokenKey(setupToken), claimId)
		.run();
}

export async function completeAutoUpdatesSetupTokenClaim(db, setupToken, claimId, nowMsValue) {
	if (!hasDb(db)) {
		return { ok: true };
	}
	try {
		await db
			.prepare(`UPDATE auto_updates_setup_claims
				SET status = 'completed', updated_at = ?
				WHERE setup_key = ? AND claim_id = ?`)
			.bind(nowIso(nowMsValue), usedSetupTokenKey(setupToken), claimId)
			.run();
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function recordAutoUpdatesInstallState(db, state) {
	if (!hasDb(db)) {
		return;
	}
	await db
		.prepare(`INSERT INTO auto_updates_install_state (
			slot,
			target_repo,
			installed_at,
			install_commit_sha,
			install_commit_url
		) VALUES ('current', ?, ?, ?, ?)
		ON CONFLICT(slot) DO UPDATE SET
			target_repo = excluded.target_repo,
			installed_at = excluded.installed_at,
			install_commit_sha = excluded.install_commit_sha,
			install_commit_url = excluded.install_commit_url`)
		.bind(
			state.targetRepo,
			state.installedAt,
			state.installCommitSha,
			state.installCommitUrl,
		)
		.run();
}

export async function readAutoUpdatesInstallState(db) {
	if (!hasDb(db)) {
		return null;
	}
	const row = await db
		.prepare(`SELECT target_repo, installed_at, install_commit_sha, install_commit_url
			FROM auto_updates_install_state
			WHERE slot = 'current'
			LIMIT 1`)
		.first();
	if (row === null || row === undefined) {
		return null;
	}
	return {
		targetRepo: row.target_repo ?? null,
		installedAt: row.installed_at ?? null,
		installCommitSha: row.install_commit_sha ?? null,
		installCommitUrl: row.install_commit_url ?? null,
	};
}
