---
name: build-state-view
description: Implements a STATE_VIEW slice on kronos-ts (query, Drizzle table and migration, projection, query handler, oRPC contract and controller, specs against Postgres) from its slice.json.
---

# Build a state-view slice

A state-view slice is one read model: a projection writes it to Postgres as events arrive, a query handler reads it.
Its worked example is `references/example/cart-items/` (with `references/example/events.ts`): **open every file of it
before writing anything, and match it file for file.** Names, types and paths follow `.build-kit/CLAUDE.md`
"Decisions the model leaves to you".

`slice.json` is the source of truth: `readmodels[0]` (fields, `idAttribute`, `listElement`), the events it reads (its
`dependencies` of type `INBOUND`), `specifications[]`, `storylines[]`, `description` and every `comments`.

## Files

Inside `src/slices/<context>/<slice>/`:

| File | What |
|---|---|
| `query.ts` | `ns.query("Get<Name>", { payload, result: result({ ...the read model }, …rejections) })`; a list read model answers an array; a view that can refuse declares its `rejection(…)`s inline, as a command does. A live view also exports its update schema (`<Name>Update`) |
| `schema.ts` | the Drizzle table(s); table name `snake_case` of the slice folder |
| `projection.ts` | its `processor` and one `eventHandler` per INBOUND event, all on it; in a live view each write ends in `.returning(...)` and `ctx.emitUpdate`; it never calls outside the system (`.build-kit/CLAUDE.md`, "What a slice needs from outside") |
| `handler.ts` | `queryHandler`: one select, mapped to the result |
| `state.ts` | only if the view folds the log instead of a table: every `state(...)` it loads, never in a file of its own |
| `contract.ts` | Request (`<Query>.payload`) / Response (`<Query>.result.success`) and the `GET` procedure; a live view also its `GET …/stream` procedure |
| `controller.ts` | `context.query(...)`, answer the read model without `ok`; a live view also its stream (`context.subscribe(...)`) |
| `index.ts` | `export const <camelName> = { router, queryHandlers: [handle], eventHandlers: projection } satisfies Slice` |
| `slice.spec.ts` | one `it(...)` per specification, against Postgres |

**Live views are opt in, and the test is the view's INBOUND events.** For each one, find what appends it (the board's
dependencies, or the slice that has it as an OUTBOUND event):
- appended by a command an **automation** sends (a processor: a mail sent, a payment captured, an item archived), or
  by a command **another user or another device** issues: the view is **live**. Its screen is open while that
  happens, and should show it without the viewer acting. A "check your email" screen showing when the mail went out
  is live: the mailer appends that event after the screen opened.
- only appended by the command the viewer's own screen just sent, and read once when the screen opens: **not live**.
Record the choice and the event that decided it with `info --kind decision`. `cart-items` streams: an automation
archives items while the cart is open.

A read model only automations read (a todo list) is not built here at all: it is the automation's own state (see
`.build-kit/CLAUDE.md`, "Pick the skill"). A read model a screen shows AND an automation reads is built here for the
screen only; the automation keeps its own. A storyline example is the last spec of
`references/example/cart-items/slice.spec.ts`.

## Steps

1. **Query.** Payload = the read model's id fields (`idAttribute: true`; when none is flagged, the id the screen
   or automation asks by, recorded with `info --kind decision`), each typed from the type table: an id is `z.uuid()`,
   so a malformed one is refused before the handler runs, and the handler never checks it. Result = the read model's fields. A list read model
   (`listElement`, or several rows per id) answers `{ items: [...] }`. An unknown id answers the empty read model,
   not a rejection, unless a specification says otherwise — then the rejection is declared in `query.ts`, the
   procedure declares `.errors(errorsOf(<Query>))`, its controller throws `refuse(call, <Query>, result)`, and
   `contract.ts` exports `statuses = statusesOf(<Query>, { CODE: 404 })` (listed in `index.ts`).
2. **Table.** One row per thing the read model lists, keyed so every write is absolute: insert with
   `onConflictDoNothing()` / upsert, delete by key. Never increment: an event can be delivered twice.
   Derived values (totals, counts) are computed in the query handler, not stored. A date or time column is ISO text,
   or a Drizzle `timestamp` whose `Date` is converted to and from Temporal right at the column.
3. **Projection.** One handler per INBOUND event, each writing through `ctx.db` (typed `EventContext`). Its processor,
   built with kronos-ts as `references/example/cart-items/projection.ts` does (`PartialProcessor` from `#kit`):
   `batched(eventProcessor("<slice-folder>", eventStore, tokenStore, unitOfWork), 100)` — global order, no
   dead-letter queue. Named for what it writes: a new table means a new name, so it replays from the start.
   **A live view's handlers emit what they changed**, as `cart-items/projection.ts` does: every write ends in
   `.returning(...)` with the view's columns, and the handler emits each returned row with
   `ctx.emitUpdate(<Query>, (q) => q.<id> === p.<id>, update)`, the filter matching the subscribers by the query's
   payload. A write that changed nothing returns nothing, so a replayed event emits nothing; updates leave after the
   batch commits. The update's shape is the view's: for a one-row view the whole new row; for a list, the row's change
   (`{ change: "added", item }`, `{ change: "removed", itemId }`), declared as `<Name>Update` in `query.ts`.
4. **Handler.** One `select` through `ctx.db` (typed `QueryContext`), mapped to the result.
5. **Migration.** `bun run db:generate`, and commit the file it writes to `migrations/`.
6. **Contract and controller.** Request = `<Query>.payload`, Response = `<Query>.result.success`, both adjusted with
   `.omit`/`.pick`/`.extend` only where the API differs, never restated. `GET` at `apiEndpoint` or
   `/<context>/<slice>`, with `summary`, `description` and `tags: ["<Slice Title>"]` (the stream shares the tag, and
   its description says what each update looks like). Every payload and result field carries
   `.meta({ description, examples })` from the board, in `query.ts`. The
   controller is `implement(contract).$context<Edge>()` and answers `context.query(...)` without `ok`. A live view adds
   `<camelName>Stream`: `GET <the same path>/stream`, the same input, output `eventIterator(StreamEvent)` where
   `StreamEvent` is the snapshot (`{ change: "snapshot", <view>: Response }`) or an update. Its controller is an
   `async function*` over `context.subscribe(<Query>, input)`: yield the snapshot from `initialResult`, then every
   update; close the subscription when the client goes away (`signal`) and in `finally`. **A stream never refuses an
   id the view does not hold yet:** a screen opens before the event that fills it (that is why it is live), so a view
   whose query refuses an unknown id streams `{ change: "snapshot", <view>: null }` instead, and the row arrives as an
   update. The plain `GET` keeps its rejection.
7. **Specs** (Postgres: `bun run infra:up`). ONE fixture per spec file, at the top:
   `const scenarios = fixture(testApp([<slice>], { db: true }))`, with `fixture` from `@kronos-ts/test`, `testApp`
   from `#test` and `<slice>` the value `index.ts` exports. `{ db: true }` gives the file a fresh database, and
   `testApp` drops it, and stops the app, after the file's last test. Every scenario runs on that fixture and shares
   its database, so each `it(...)` mints its own ids with `Bun.randomUUIDv7()` (a cart of its own, items of its own).
   One `it(...)` per specification, mapped one to one from `slice.json`:
   `await scenarios.given(...events).when(query(Q, payload)).then(result({ ok: true, ... }))`.
   The spec's `given` events reach the projection; its `then` read model (or `expectEmptyList`) becomes the expected
   answer. A storyline in `slice.json` becomes
   `await scenarios.storyline(query(Q, payload)).shows(...).after(...events).shows(...)`, one `shows` per read-model
   beat and one `after` per run of event beats.
   A live view adds one spec of its stream, as the last spec of `references/example/cart-items/slice.spec.ts` does:
   open `subscriptionQuery` on the app's query bus, expect the snapshot, then act and expect each update.
8. List the slice in its context's `index.ts` (`src/slices/<context>/index.ts`; a new context: that file, and one line in `src/slices/index.ts`).
9. `bun run typecheck`, then `bun test src/slices/<context>/<slice>`.

## UI Contract

**Only when handover is on** (the task's `Handover: on` line): once the slice's specs pass, invoke the `ui-contract`
skill. Its source here is the OpenAPI document the app generates: `bun run ui-contract <path>` prints the slice's
whole `## UI Contract` section (`**READ**`; a live view's `/stream` operation goes in the same block), each refusal's problem
document included. Publish that output verbatim; never write or edit the YAML by hand. A mismatch with `slice.json` is a bug in the code: fix it,
then print again.

## Done when

- [ ] every read-model field is in the result and the Response, and nothing else is
- [ ] every INBOUND event has a projection handler, and every write is safe to repeat
- [ ] the migration is generated and committed
- [ ] every specification is an `it(...)`
- [ ] each INBOUND event's origin is checked: a view any automation or other actor writes streams; the choice and its event are recorded; a live view emits from every handler
