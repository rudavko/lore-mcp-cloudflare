/** @implements FR-011 — Default-handler dependency assembly for browser auth/admin routes. */
import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import QrCode from "qrcode-svg";
import { installWorkflowToRepo } from "lore-mcp/domain/github-workflow.ops.efct.js";
import {
	parseTargetRepo,
	renderWorkflowYaml,
	normalizeRepoFullName,
} from "lore-mcp/domain/github-workflow.pure.js";
import {
	FAIL_WINDOW_TTL_SECONDS,
	LOCKOUT_TTL_SECONDS,
	bodyString,
	failKey,
	lockKey,
	nextFailCount,
	isLockoutReached,
	byteValuesToHexString,
} from "lore-mcp/lib/auth-helpers.pure.js";
import { registerAuthRoutes } from "lore-mcp/auth.orch.1.js";
import { renderAuthPage } from "lore-mcp/templates/auth-page.pure.js";
import { renderEnrollPasskeyPage } from "lore-mcp/templates/enroll-passkey.pure.js";
import { renderEnrollTotpPage } from "lore-mcp/templates/enroll-totp.pure.js";
import { registerAdminRoutes } from "./admin-routes.orch.1.js";
import { renderInstallWorkflowPage } from "./install-workflow-page.pure.js";
import { discoverDeployRepo } from "./discover-deploy-repo.efct.js";
import {
	createAutoUpdatesTokenDeps,
	readAutoUpdatesSetupToken,
} from "./auto-updates-token.efct.js";
import {
	PASSKEY_CRED_KEY,
	CHALLENGE_TTL_SECONDS,
	challengeKey,
	buildStoredCredentialData,
	parseStoredCredentialData,
} from "lore-mcp/webauthn.pure.js";
import {
	kvGet as webauthnKvGet,
	kvPut as webauthnKvPut,
	kvPutTtl as webauthnKvPutTtl,
	kvDelete as webauthnKvDelete,
} from "../webauthn.efct.js";
import {
	base32Encode,
	base32Decode,
	validateTotpFormat,
	counterToBytes,
	computeTimeCounter,
	extractHotpCode,
	buildOtpAuthUri,
} from "lore-mcp/totp.pure.js";
import { makeInstallWorkflowToRepoRuntime } from "./github-workflow-adapter.efct.js";

function createPlatform(runtimeGlobal) {
	return {
		bodyString,
		byteValuesToHexString,
		cryptoLike: runtimeGlobal.crypto,
		urlCtor: runtimeGlobal.URL,
		headersCtor: runtimeGlobal.Headers,
		responseCtor: runtimeGlobal.Response,
		textEncoderCtor: runtimeGlobal.TextEncoder,
		textDecoderCtor: runtimeGlobal.TextDecoder,
		uint8ArrayCtor: runtimeGlobal.Uint8Array,
		jsonParse: runtimeGlobal.JSON.parse,
		jsonStringify: runtimeGlobal.JSON.stringify,
		atob: runtimeGlobal.atob.bind(runtimeGlobal),
		btoa: runtimeGlobal.btoa.bind(runtimeGlobal),
		stringFromCharCode: runtimeGlobal.String.fromCharCode,
		encodeUriComponent: runtimeGlobal.encodeURIComponent,
		decodeUriComponent: runtimeGlobal.decodeURIComponent,
		nowMs: runtimeGlobal.Date.now,
		floor: runtimeGlobal.Math.floor,
		numberIsFinite: runtimeGlobal.Number.isFinite,
		arrayFrom: runtimeGlobal.Array.from,
		arrayIsArray: runtimeGlobal.Array.isArray,
		mapCtor: runtimeGlobal.Map,
		typeErrorCtor: runtimeGlobal.TypeError,
	};
}

function createAuthState() {
	return {
		failKey,
		lockKey,
		nextFailCount,
		isLockoutReached,
		failWindowTtlSeconds: FAIL_WINDOW_TTL_SECONDS,
		lockoutTtlSeconds: LOCKOUT_TTL_SECONDS,
		passkeyCredentialKey: PASSKEY_CRED_KEY,
		challengeTtlSeconds: CHALLENGE_TTL_SECONDS,
		challengeKey,
		kvGet: webauthnKvGet,
		kvPut: webauthnKvPut,
		kvPutTtl: webauthnKvPutTtl,
		kvDelete: webauthnKvDelete,
	};
}

function createWebauthn() {
	return {
		buildStoredCredentialData,
		parseStoredCredentialData,
		generateRegistrationOptions,
		verifyRegistrationResponse,
		generateAuthenticationOptions,
		verifyAuthenticationResponse,
	};
}

function createOtp() {
	return {
		base32Encode,
		base32Decode,
		validateTotpFormat,
		counterToBytes,
		computeTimeCounter,
		extractHotpCode,
		buildOtpAuthUri,
	};
}

function createUi() {
	return {
		renderAuthPage,
		renderEnrollPasskeyPage,
		renderEnrollTotpPage,
		renderInstallWorkflowPage,
		qrCodeCtor: QrCode,
	};
}

function createAdmin(runtimeGlobal) {
	const workflowRuntime = makeInstallWorkflowToRepoRuntime({
		installWorkflowToRepo,
		discoverDeployRepo,
		parseTargetRepo,
		renderWorkflowYaml,
		btoa: runtimeGlobal.btoa.bind(runtimeGlobal),
		githubFetchApi: (input, init) => runtimeGlobal.fetch(input, init),
		jsonStringify: runtimeGlobal.JSON.stringify,
	});
	return {
		installWorkflowToRepo: workflowRuntime.installWorkflowToRepo,
		discoverDeployRepo: workflowRuntime.discoverDeployRepo,
		normalizeRepoFullName,
		readAutoUpdatesSetupToken: (token, tokenDeps) =>
			readAutoUpdatesSetupToken(
				token,
				createAutoUpdatesTokenDeps(
					{
						cryptoLike: tokenDeps.cryptoLike,
						textEncoderCtor: tokenDeps.textEncoderCtor,
						textDecoderCtor: tokenDeps.textDecoderCtor,
						uint8ArrayCtor: tokenDeps.uint8ArrayCtor,
						arrayFrom: tokenDeps.arrayFrom,
						stringFromCharCode: tokenDeps.stringFromCharCode,
						numberIsFinite: tokenDeps.numberIsFinite,
						btoa: tokenDeps.btoa,
						atob: tokenDeps.atob,
						jsonStringify: JSON.stringify,
						jsonParse: tokenDeps.jsonParse,
						nowMs: tokenDeps.nowMs,
					},
					tokenDeps.accessPassphrase,
				),
			),
	};
}

export function createDefaultHandlerConfig(runtimeGlobal) {
	return {
		routeRegistration: {
			registerAuthRoutes,
			registerAdminRoutes,
		},
		platform: createPlatform(runtimeGlobal),
		authState: createAuthState(),
		webauthn: createWebauthn(),
		otp: createOtp(),
		ui: createUi(),
		admin: createAdmin(runtimeGlobal),
	};
}
