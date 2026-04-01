/** @implements FR-001, ADR-0001 — Verify initialization wiring creates runtime surfaces from a single dependency index. */
import { describe, expect, test } from "bun:test";
import { makeInitLoreMcp, makeProcessLoreIngestion } from "./loremcp.efct.js";
import { createLoreMcpInstanceHost } from "./loremcp-host.orch.4.js";
import { createBaseStd } from "../test-helpers/runtime.shared.helper.js";

function mapSummaryData(raw) {
	const counts = raw[0]?.results || [];
	let entries = 0;
	let triples = 0;
	let entities = 0;
	for (let i = 0; i < counts.length; i++) {
		const key = counts[i].t;
		const value = Number(counts[i].c) || 0;
		if (key === "entries") {
			entries = value;
		}
		if (key === "triples") {
			triples = value;
		}
		if (key === "entities") {
			entities = value;
		}
	}
	const topics = [];
	for (const row of raw[1]?.results || []) {
		if (typeof row.topic === "string") {
			topics.push(row.topic);
		}
	}
	const tripleSamples = [];
	for (const row of raw[2]?.results || []) {
		if (
			typeof row.subject === "string" &&
			typeof row.predicate === "string" &&
			typeof row.object === "string"
		) {
			tripleSamples.push({
				subject: row.subject,
				predicate: row.predicate,
				object: row.object,
			});
		}
	}
	const tagLists = [];
	for (const row of raw[3]?.results || []) {
		if (typeof row.tags !== "string") {
			continue;
		}
		try {
			const parsed = JSON.parse(row.tags);
			if (Array.isArray(parsed)) {
				tagLists.push(parsed.filter((tag) => typeof tag === "string"));
			}
		} catch {}
	}
	return { entries, triples, entities, topics, tripleSamples, tagLists };
}
describe("wiring/loremcp.efct makeInitLoreMcp", () => {
	test("keeps startup alive when processIngestion throws", async () => {
		let configured = false;
		function FakeServer(opts) {
			return { opts };
		}
		const init = makeInitLoreMcp({
			createLoreMcpInstanceHost,
			std: createBaseStd(globalThis),
			initSchema: async () => {},
			querySummaryCounts: async () => [],
			formatSummary: () => "summary",
			mapSummaryData,
			McpServerCtor: FakeServer,
			serverName: "Lore",
			serverVersion: "0.0.0-test",
			configureServer: async () => {
				configured = true;
			},
		});
		const runtime = {
			env: { DB: {} },
			server: null,
			processIngestion: async () => Promise.reject(new Error("ingestion failed")),
		};
		await init(runtime);
		expect(configured).toBe(true);
		expect(runtime.server).toEqual(
			expect.objectContaining({
				opts: {
					name: "Lore",
					version: "0.0.0-test",
					instructions: "summary",
				},
			}),
		);
	});

	test("maps summary rows before formatting instructions", async () => {
		let seenSummaryData = null;
		function FakeServer(opts) {
			return { opts };
		}
		const init = makeInitLoreMcp({
			createLoreMcpInstanceHost,
			std: createBaseStd(globalThis),
			initSchema: async () => {},
			querySummaryCounts: async () => [
				{
					results: [
						{ t: "entries", c: "2" },
						{ t: "triples", c: "3" },
						{ t: "entities", c: 4 },
					],
				},
				{ results: [{ topic: "Topic A" }, { topic: 42 }] },
				{
					results: [
						{ subject: "S", predicate: "P", object: "O" },
						{ subject: "skip", predicate: "skip", object: null },
					],
				},
				{ results: [{ tags: '["alpha","beta",1]' }, { tags: "not-json" }] },
			],
			formatSummary: (data) => {
				seenSummaryData = data;
				return "summary";
			},
			mapSummaryData,
			McpServerCtor: FakeServer,
			serverName: "Lore",
			serverVersion: "0.0.0-test",
		});
		const runtime = {
			env: { DB: {} },
			server: null,
			processIngestion: async () => {},
		};

		await init(runtime);

		expect(seenSummaryData).toEqual({
			entries: 2,
			triples: 3,
			entities: 4,
			topics: ["Topic A"],
			tripleSamples: [{ subject: "S", predicate: "P", object: "O" }],
			tagLists: [["alpha", "beta"]],
		});
	});

	test("falls back to default summary when summary queries fail", async () => {
		let formatSummaryCalled = false;
		function FakeServer(opts) {
			return { opts };
		}
		const init = makeInitLoreMcp({
			createLoreMcpInstanceHost,
			std: createBaseStd(globalThis),
			initSchema: async () => {},
			querySummaryCounts: async () => Promise.reject(new Error("summary failed")),
			formatSummary: () => {
				formatSummaryCalled = true;
				return "unexpected";
			},
			mapSummaryData,
			McpServerCtor: FakeServer,
			serverName: "Lore",
			serverVersion: "0.0.0-test",
		});
		const runtime = {
			env: { DB: {} },
			server: null,
			processIngestion: async () => {},
		};

		await init(runtime);

		expect(runtime.server.opts.instructions).toBe(
			"Lore knowledge store — summary unavailable.",
		);
		expect(formatSummaryCalled).toBe(false);
	});
});

describe("wiring/loremcp.efct makeProcessLoreIngestion", () => {
	test("schedules another ingestion pass when work remains", async () => {
		const scheduled = [];
		function FakeDate(value) {
			return { value };
		}
		const processLoreIngestion = makeProcessLoreIngestion({
			createLoreMcpInstanceHost,
			runIngestion: async (env, server) => {
				expect(env).toEqual({ DB: "db-handle" });
				expect(server).toEqual({ id: "server-1" });
				return 2;
			},
			shouldReschedule: (remaining) => remaining > 0,
			rescheduleDelayMs: 60000,
			nowMs: () => 1000,
			dateCtor: FakeDate,
		});

		await processLoreIngestion({
			env: { DB: "db-handle" },
			server: { id: "server-1" },
			schedule: async (when, label) => {
				scheduled.push({ when, label });
			},
		});

		expect(scheduled).toEqual([
			{
				when: expect.objectContaining({ value: 61000 }),
				label: "processIngestion",
			},
		]);
	});

	test("does not schedule when no work remains", async () => {
		const scheduled = [];
		const processLoreIngestion = makeProcessLoreIngestion({
			createLoreMcpInstanceHost,
			runIngestion: async () => 0,
			shouldReschedule: () => false,
			rescheduleDelayMs: 60000,
			nowMs: () => 1000,
			dateCtor: Date,
		});

		await processLoreIngestion({
			env: { DB: "db-handle" },
			server: { id: "server-1" },
			schedule: async (...args) => {
				scheduled.push(args);
			},
		});

		expect(scheduled).toEqual([]);
	});

	test("reschedules when runIngestion throws", async () => {
		const scheduled = [];
		function FakeDate(value) {
			return { value };
		}
		const processLoreIngestion = makeProcessLoreIngestion({
			createLoreMcpInstanceHost,
			runIngestion: async () => Promise.reject(new Error("ingestion failed")),
			shouldReschedule: (remaining) => remaining > 0,
			rescheduleDelayMs: 60000,
			nowMs: () => 1000,
			dateCtor: FakeDate,
		});

		await expect(
			processLoreIngestion({
				env: { DB: "db-handle" },
				server: { id: "server-1" },
				schedule: async (when, label) => {
					scheduled.push({ when, label });
				},
			}),
		).resolves.toBeUndefined();

		expect(scheduled).toEqual([
			{
				when: expect.objectContaining({ value: 61000 }),
				label: "processIngestion",
			},
		]);
	});
});
