# Agent Note: Desktop welcome accepts a profile's own account service

Status: implemented

English | [中文](2026-11-10-desktop-external-account-sign-in.zh.md)

## Problem

A distribution that mounts its own account service must let users sign in with that account at first launch, without a DeepSeek account or an official provider key. The welcome window only offered DeepSeek sign-in and an API-key form, and its startup check reads as if it required DeepSeek specifically.

## Decision

The startup check never named a vendor. [`needsWelcome`](../../../../apps/desktop/src/welcome-api.ts) opens the welcome window only when the account has no stored credential **and** [`read()`](../../../../apps/desktop/src/welcome-backend.ts) finds no configured credential reference for any configurable provider route; `hasApiKey` is the union over the `llm` provider directory, and every `llm-pi-ai` profile route that declares `apiKeyEnv` joins it. A profile that mounts an account service writing its token under such a reference therefore authenticates without any provider-specific branch in the shell. The `desktop-wainao-sign-in` fork branch adds only the entry that produces that token.

[`external-sign-in.ts`](../../../../apps/desktop/src/external-sign-in.ts) runs one attempt: a loopback HTTP listener on `127.0.0.1` serves the vendor's redirect path, the shell opens the authorization URL in the system browser, and the returned code goes to the profile's service, which owns the exchange, credential writes, model routes, and token renewal. The descriptor names the plugin's Host RPC path and endpoint ids; no vendor protocol or brand endpoint lives in the shell. A Host that serves none of them fails the probe, so a stock DSH profile keeps its stock entries. The probe runs when the welcome window is first needed and is bounded, so a Host that never answers cannot keep the window from opening. A redirect that echoes another attempt's state is refused, and the page after a completed redirect never reflects request parameters.

## Alternatives considered

Implementing the OAuth exchange in the shell would have required a new Host RPC for grant records and a second renewal path; the profile's service already stores both, so the shell stays a consumer. Using `dsh://` as the redirect would require the service to accept a non-HTTP redirect URI, which its Host RPC does not express. The vendor currently accepts an unregistered loopback redirect only because the service requests its development mode; a real callback address must be registered before the distribution ships.

## Consequences

The welcome window offers the extra entry only when the mounted profile serves the endpoints. Cold starts after a successful exchange enter the workspace directly, and an expired or revoked token returns to the welcome window, where the same entry recovers it. The DeepSeek entries and the official API-key path are unchanged and remain available beside it.
