# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Joe uses it daily on his own machine to scan which AI subscriptions are running low before he picks the next one to use. Other developers who clone the repo are a second audience: on first open they need to understand what each provider is, where its credential lives, and why a read failed.

## Product Purpose

Aggregate the remaining quota of several AI subscriptions into one local view. Success is a glance that shows which source is usable, which is low or exhausted, and when a window resets, without sending quota data or credentials anywhere.

## Positioning

The numbers come from consoles the user has already signed into, from credentials the official client already stored locally, or from an API key the user configured for a read-only endpoint. A neighboring dashboard that asks for a password, uploads cookies, or hosts the login cannot make the same claim.

## Operating Context

The tool runs on the user's Mac or Linux machine. Chrome with a dedicated profile and remote debugging port supplies the console reads. API-backed sources use an environment variable or a file the official client already wrote. The same state file feeds the local page (`quota serve`) and the Harness composer strip. Refresh is explicit: the page button, the strip button, or `quota fetch`.

## Capabilities and Constraints

- Sources today: OpenCode Go, X Premium (Grok), Claude, 智谱 GLM Coding Plan, DeepSeek, 阿里云百炼 Coding Plan, OpenAI Codex.
- Each source has its own windows (5-hour, week, month, points, or a balance with no reset). Missing windows stay empty. Failures keep the last good numbers.
- Console reads reload the already-open tab and parse visible text. They do not click, type, or export cookies, tokens, or storage.
- API reads use the user's own key or the official local credential file. Credentials are not written into `state.json`.
- The local page binds to 127.0.0.1 and requires the one-time token printed at startup.
- The Harness strip sits above the composer. Its detail layer is a popover anchored to the strip, not a modal.
- Interface copy is Chinese, matching the CLI and the existing pages.
- The tool is unofficial and unrelated to the providers it reads. Platform page changes can break a read.

## Brand Commitments

The product name in the interface is「AI 额度看板」. The command is `quota`. Voice stays direct and local: say what failed and what to do next. Do not imply an official relationship with any provider.

## Evidence on Hand

Real quota snapshots, error codes, and provider names come from the app itself. There are no customer quotes, logos from the providers, or usage claims beyond what a local read returns. Do not invent them.

## Product Principles

- A glance decides the next model: the scarce or exhausted source has to be obvious before the healthy ones.
- A failed read stays honest. Show the last number and the reason, and never fill a missing window with zero.
- Credentials and quota numbers stay on the machine.
- The local page and the Harness strip are one product, not two skins.
- Someone who just cloned the repo can tell a missing credential from a changed page.
