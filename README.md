# lore-mcp-cloudflare

Cloudflare-specific deploy shell for `lore-mcp`.

What it does:
- provides the deployable Worker package and Wrangler config for downstream repos
- delegates runtime behavior to the current sibling `lore-mcp` package
- keeps repo-local deploy configuration separate from the future extracted core package

Why it exists:
- the downstream deploy repo should stay small and deployment-focused
- `lore-mcp` can be converted into `lore-mcp-core` later without changing the shell repo shape again

## Current shape

- `src/index.ts` is the Cloudflare entrypoint that consumes the `lore-mcp` package
- `wrangler.jsonc` carries the Worker bindings/resources expected by the main app
- `public/` and `migrations/` are currently copied into the shell because those deploy assets still belong to the deploy package shape

## Planned evolution

1. Convert `lore-mcp` into a publishable/importable `lore-mcp-core` package.
2. Replace the temporary sibling import in `src/index.ts` with a package dependency.
3. Keep this Cloudflare package as the downstream deploy target whose commits trigger Cloudflare redeploys.

## Deployment

This package is intended to be the repo that Cloudflare deploys from. A later updater flow can bump the core package version here and let Cloudflare rebuild and redeploy from this Cloudflare package.
