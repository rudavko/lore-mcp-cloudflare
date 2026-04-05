CREATE TABLE IF NOT EXISTS auto_updates_setup_claims (
	setup_key TEXT PRIMARY KEY,
	claim_id TEXT NOT NULL,
	status TEXT NOT NULL,
	expires_at_ms INTEGER NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_updates_install_state (
	slot TEXT PRIMARY KEY,
	target_repo TEXT NOT NULL,
	installed_at TEXT NOT NULL,
	install_commit_sha TEXT,
	install_commit_url TEXT
);
