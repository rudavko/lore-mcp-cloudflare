/** @implements FR-001 — Build MCP agent constructor from injected base agent type and runtime hooks. */
export function createLoreMcpCtor(deps) {
	return new deps.proxyCtor(deps.McpAgentCtor, {
		construct: (target, args, newTarget) => {
			const instance = deps.reflectConstruct(target, args, newTarget);
			return deps.defineProperties(instance, {
				init: {
					value: (...callArgs) => deps.init(instance, ...callArgs),
					configurable: true,
					writable: true,
					enumerable: true,
				},
				processIngestion: {
					value: (...callArgs) => deps.processIngestion(instance, ...callArgs),
					configurable: true,
					writable: true,
					enumerable: true,
				},
			});
		},
	});
}
