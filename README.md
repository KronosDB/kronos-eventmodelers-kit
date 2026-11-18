# Kronos build kit for Eventmodelers

A stack for [`@eventmodelers/cli`](https://www.npmjs.com/package/@eventmodelers/cli): the build agent turns the
slices of an Eventmodelers board into a kronos-ts service on Bun, with oRPC for HTTP, Drizzle read models, KronosDB
for events and Postgres for read models, tokens and dead letters.

## Using it

You need Bun 1.4+, Docker (for KronosDB and Postgres), and the Eventmodelers CLI with a board.

```bash
npx @eventmodelers/cli init --stack kronos --git https://github.com/KronosDB/kronos-eventmodelers-kit
npx @eventmodelers/cli run --model sonnet
```

Once the stack ships with the CLI, `--git` is no longer needed: `init --stack kronos`.

- **The model:** build with Sonnet. kronos-ts is newer than what models were trained on, so the agent leans on the
  worked examples in the skills and on kronos-ts's own source in `node_modules`. Sonnet builds an 18-slice
  accounts and login model unattended, with every spec passing; Haiku leaves slices unfinished.
- **Rebuilding a slice:** a slice set back to Planned whose model has not changed is found `UNCHANGED` by the
  baseline gate: its specs run and it is done again, with no rebuild. To rebuild it anyway, delete its folder under
  `src/slices/` first.
- **Sessions are the app's:** the kit builds no authentication. The app decides it in `src/app/auth.ts`: who is
  asking (`identify`, anonymous until filled in) and a `signedIn` middleware for procedures that need a signed-in
  caller. See "Who is asking" in the starter's README.
- **Deploying:** the starter has a `Dockerfile` for the app; KronosDB and Postgres are yours to run.

## What is in this repo

```
reference/      the reference app: Nebulit's demo model ("Understanding Eventsourcing") built by hand, with specs.
                The single source of truth for what a slice should look like. src/examples/ holds worked examples
                the model has no slice for (time, with Temporal), tested with the rest but not part of the app.
templates/      what the CLI installs (the layout every stack uses)
  root/           the starter app, GENERATED from reference/ without its slices
  build-kit/      CLAUDE.md (conventions and the decisions the kit makes), lib/ prompts
  .claude/skills/ build-state-change, build-state-view, build-automation; each skill's references/ is
                  GENERATED from the matching reference slice (and build-state-change's references/time/ from
                  reference/src/examples/send-reminder)
scripts/sync.sh regenerates templates/root and the skill examples from reference/
stack.json      for `init --stack kronos --git <this repo>`: label, kit folder
```

## Working on it

```bash
cd reference
bun install
bun run infra:up        # Postgres + KronosDB
bun run typecheck && bun test src
cd .. && ./scripts/sync.sh
```

Change a convention in `reference/` first, prove it with its specs, then sync. Never edit `templates/root` or a
skill's `references/` by hand.

The kit (`reference/src/kit/`) holds conventions only: the result and rejection shape, the protocol-neutral
contract errors and the HTTP statuses beside them, the handler contexts, the slice shape and `pipe`. kronos-ts, oRPC
and Drizzle are used directly, with their own types. A command whose append lost a race is answered 409 at the HTTP
edge, and the caller sends it again (it carries its own id and lands once); an automation's processor retries it. A
store or bus that cannot be reached is answered 503.

## Versions

kronos-ts from npm: core 0.12.0 (`isConflict`, `isNoHandler`, `isUnavailable`, the typed `App`, every query declares its result, and `validatingHandler` checks every answer against it),
kronosdb 0.13.5, postgres 0.21.5, otlp 0.7.7 and `@kronos-ts/test` 0.9.3 (`fixture(app)`, `given` handled live). KronosDB 0.16+; 0.16.0 in
docker-compose, beside Postgres 18.
oRPC 2.0.0-beta.51, Drizzle 0.45, Bun 1.4.4 (the Dockerfile's image). The reference and the starter name the same versions.

## The app

`src/main.ts` is the production composition, top to bottom: KronosDB for the events and the buses, Postgres for the read
models, tokens and dead letters, and OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. There is no local or in-memory
mode and no fallback: locally it is the same file over `bun run infra:up` (the dev values are in `.env.example`), and a
dependency that cannot be reached stops the boot. `DATABASE_URL` and `KRONOSDB_HOST` are required in `src/env.ts`.
Commands go through KronosDB, queries are answered locally first (see the comments in `main.ts`).

`src/app.ts` is the composition root: `app(resources, slices = all)`, one explicit
`kronos({ commandHandlers, queryHandlers, eventHandlers })` call with each kind's `pipe` written out inline, innermost
first (validation, correlation, logging, tracing; queries and event handlers also get the database). `main.ts` and the
tests call this same function with their own resources. `src/slices/index.ts` lists the contexts (each context's `index.ts` lists its slices and wires the outside clients
only they use), with the HTTP-only
`router` and `statuses` beside them; they never enter `app()`. `src/app/http.ts` serves the router and takes its buses off
the app, with the OpenAPI document at `/openapi.json` and its reference (Scalar) at `/docs`: in development, or
with `API_DOCS=true`. Every refusal is an RFC 9457 problem document whose `type` belongs to the message that refuses
(`/problems/add-item/cart-full`), and opens its row in the reference. Who is asking comes from `identify(request)`
in `src/app/auth.ts`, which the app fills in (anonymous until then): `actor` and `actorType` go on the request's message, and `app.ts`
carries them with the correlation onto the events it causes. An automation acts as itself (`actorType: "automation"`,
its processor's name), with the user one correlation away. A command whose append lost a race is answered 409 there, recognised with core's `isConflict` also when
the command ran on another instance; a store or bus that cannot be reached is answered 503 (`isUnavailable`).

Logging and tracing are on in the starter: `app()` wraps every handler (validation, correlation, `ctx.log`, OTLP span)
and `main.ts` builds the console logger and, from `OTEL_EXPORTER_OTLP_ENDPOINT`, the exporter. `bun run telemetry:up`
starts a local Grafana LGTM stack (Grafana on :3001, OTLP on :4318); see the starter's own README.

## Specs

A slice's spec file is the slice's scenarios on the board, one test each, named with the scenario's title, and
nothing else. What the kit itself guarantees (the HTTP edge and its problems, a live view's stream, an automation
acting as itself, an outside call traced with the handling) is tested by the kit's own specs, in `src/app.spec.ts`
and `src/app/`, so the starter carries them with no slices.

A spec file builds ONE fixture, `fixture(testApp(slices, { db? }))`, and runs every scenario on it. `testApp`
(`test/index.ts`) returns the same `app()` over test resources: an in-memory log recorded with a clock, a recorded
command bus over a local one, a local query bus, and in-memory or Postgres tokens, dead letters and processing. It stops
the app, and drops its database, after the file's last test. Scenarios share the app and nothing is reset between them,
so each one mints its ids with `Bun.randomUUIDv7()`. Decision specs run in memory; view specs pass `{ db: true }` and
get a fresh Postgres database (`bun run infra:up`), copied from a template named for the migrations it holds, so it is
built once and reused across runs.

## License

Apache-2.0, like kronos-ts and KronosDB.
