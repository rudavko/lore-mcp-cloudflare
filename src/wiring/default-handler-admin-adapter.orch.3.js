/** @implements FR-011 — Build admin-route dependencies from request-local default-handler context. */
import {
	claimAutoUpdatesSetupToken,
	completeAutoUpdatesSetupTokenClaim,
	isAutoUpdatesSetupTokenConsumed,
	readAutoUpdatesInstallState,
	recordAutoUpdatesInstallState,
	releaseAutoUpdatesSetupTokenClaim,
} from "./auto-updates-install-state.efct.js";

function createPrefixedRouter(router, prefix) {
	return {
		get: (path, handler) => {
			router.get(prefix + path, handler);
		},
		post: (path, handler) => {
			router.post(prefix + path, handler);
		},
	};
}

function createDefaultHandlerAdminRouteDeps(ctx) {
	const platform = ctx.config.platform;
	const authState = ctx.config.authState;
	const admin = ctx.config.admin;
	const ui = ctx.config.ui;
	const accessPassphrase = ctx.http.getAccessPassphrase();
	const kv = ctx.http.getAuthKv();
	const db = ctx.http.getDb();

	return {
		setCookie: ctx.http.setCookie,
		getCookie: ctx.http.getCookie,
		randomToken: ctx.helpers.randomTokenHex,
		safeStringEqual: ctx.helpers.safeStringEqual,
		bodyString: platform.bodyString,
		isIpLocked: ctx.http.isIpLocked,
		clearAuthFailures: ctx.http.clearAuthFailures,
		installWorkflowToRepo: admin.installWorkflowToRepo,
		discoverDeployRepo: admin.discoverDeployRepo,
		normalizeRepoFullName: (repoName) => admin.normalizeRepoFullName(repoName) || "",
		readAutoUpdatesSetupToken: (token) =>
			admin.readAutoUpdatesSetupToken(token, {
				accessPassphrase,
				cryptoLike: platform.cryptoLike,
				textEncoderCtor: platform.textEncoderCtor,
				textDecoderCtor: platform.textDecoderCtor,
				uint8ArrayCtor: platform.uint8ArrayCtor,
				arrayFrom: platform.arrayFrom,
				stringFromCharCode: platform.stringFromCharCode,
				numberIsFinite: platform.numberIsFinite,
				btoa: platform.btoa,
				atob: platform.atob,
				jsonParse: platform.jsonParse,
				nowMs: platform.nowMs,
			}),
		isAutoUpdatesSetupTokenConsumed: (setupToken) =>
			isAutoUpdatesSetupTokenConsumed(db, setupToken),
		claimAutoUpdatesSetupToken: async (setupToken, expiresAtMs) =>
			await claimAutoUpdatesSetupToken(
				db,
				setupToken,
				expiresAtMs,
				ctx.helpers.randomTokenHex(),
				platform.nowMs(),
			),
		releaseAutoUpdatesSetupTokenClaim: (setupToken, claimId) =>
			releaseAutoUpdatesSetupTokenClaim(db, setupToken, claimId),
		completeAutoUpdatesSetupTokenClaim: (setupToken, claimId) =>
			completeAutoUpdatesSetupTokenClaim(db, setupToken, claimId, platform.nowMs()),
		recordAutoUpdatesInstallState: (state) => recordAutoUpdatesInstallState(db, state),
		readAutoUpdatesInstallState: () => readAutoUpdatesInstallState(db),
		renderInstallWorkflowPage: ui.renderInstallWorkflowPage,
		parseBody: ctx.http.parseBody,
		queryParam: ctx.http.queryParam,
		htmlResponse: ctx.http.htmlResponse,
		textResponse: ctx.http.textResponse,
		nowMs: platform.nowMs,
	};
}

export { createDefaultHandlerAdminRouteDeps, createPrefixedRouter };
