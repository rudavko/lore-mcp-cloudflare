/** @implements FR-001 — Host-scoped runtime operation inputs and adapters. */
import { parsePositiveInteger } from "lore-mcp/wiring/runtime-value-helpers.orch.3.js";

const DEFAULT_EMBEDDING_MODEL_ID = "@cf/baai/bge-base-en-v1.5";

function createRuntimeOpsHostDeps(env, deps) {
	return {
		db: env.DB,
		embeddingModelId: env.EMBEDDING_MODEL_ID || DEFAULT_EMBEDDING_MODEL_ID,
		embeddingMaxRetries: parsePositiveInteger(env.EMBEDDING_MAX_RETRIES, 5, deps.std),
		semanticMinScore: env.SEMANTIC_MIN_SCORE,
		aiRun: env.AI ? (model, input) => env.AI.run(model, input) : null,
		vectorQuery: env.VECTORIZE_INDEX
			? (vector, options) => env.VECTORIZE_INDEX.query(vector, options)
			: null,
		vectorizeUpsert: env.VECTORIZE_INDEX ? (vectors) => env.VECTORIZE_INDEX.upsert(vectors) : null,
	};
}

export { createRuntimeOpsHostDeps };
