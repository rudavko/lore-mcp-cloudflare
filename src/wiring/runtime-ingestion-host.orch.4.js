/** @implements FR-003 — Host-scoped ingestion runtime inputs and adapters. */
import { parsePositiveInteger } from "lore-mcp/wiring/runtime-value-helpers.orch.3.js";

const DEFAULT_EMBEDDING_MODEL_ID = "@cf/baai/bge-base-en-v1.5";

function createRunIngestionHostDeps(env, deps) {
	const db = env.DB;
	const aiRun = env.AI ? (model, input) => env.AI.run(model, input) : null;
	const vectorizeUpsert = env.VECTORIZE_INDEX ? (vectors) => env.VECTORIZE_INDEX.upsert(vectors) : null;
	const embeddingModelId = env.EMBEDDING_MODEL_ID || DEFAULT_EMBEDDING_MODEL_ID;

	return {
		db,
		embeddingModelId,
		embeddingMaxRetries: parsePositiveInteger(env.EMBEDDING_MAX_RETRIES, 5, deps.std),
		embeddingRetryBatchSize: parsePositiveInteger(env.EMBEDDING_RETRY_BATCH_SIZE, 20, deps.std),
		embeddingRetryStaleMs: parsePositiveInteger(env.EMBEDDING_RETRY_STALE_MS, 120000, deps.std),
		syncEmbedding: async (id, text) => {
			await deps.syncEmbeddingOrch(id, text, { aiRun, embeddingModelId, vectorizeUpsert });
		},
	};
}

export { createRunIngestionHostDeps };
