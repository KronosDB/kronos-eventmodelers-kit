import { expect, it } from "bun:test"
import { type ClientContext, type CommandContext, result, type Slice } from "#kit"
import { testApp } from "#test"
import { commandHandler, withNamespace } from "@kronos-ts/core"
import { type OtlpExporter, SpanKind, spanId, type StartSpanOptions, traceId } from "@kronos-ts/otlp"
import { command, event, events, fixture } from "@kronos-ts/test"
import { z } from "zod"

// An outside client, as a context's index.ts wires one: its call runs in a child span of the handling, and the
// request carries that span's traceparent, so the trace goes on into the system it calls.
type Partner = { notify(id: string, ctx: ClientContext): Promise<void> }
const sent: { id: string; traceparent: string | undefined }[] = []
const partner: Partner = {
  notify: (id, ctx) =>
    ctx.trace.run("partner.notify", async (span) => void sent.push({ id, traceparent: span.traceparent }), { kind: SpanKind.CLIENT }),
}

const ns = withNamespace("tracing-spec")
const NotifyPartner = ns.command("NotifyPartner", { payload: z.object({ pingId: z.uuid() }), result: result({}) })
const PartnerNotified = ns.event("PartnerNotified", { payload: z.object({ pingId: z.uuid() }), tags: { pingId: (p) => p.pingId } })
// The command's handler makes the outside call, then records it.
const notifyPartner = (partner: Partner) =>
  ({
    commandHandlers: [
      commandHandler(NotifyPartner, async ({ payload: p }, ctx: CommandContext) => {
        await partner.notify(p.pingId, ctx)
        ctx.append(PartnerNotified, p)
        return { ok: true }
      }),
    ],
  }) satisfies Slice

// Every span the app starts, as the exporter is handed it.
const spans: (StartSpanOptions & { traceId: string; spanId: string })[] = []
const exporter: OtlpExporter = {
  startSpan: (options) => {
    const span = { ...options, traceId: options.parent?.traceId ?? traceId(), spanId: spanId() }
    spans.push(span)
    return { traceId: span.traceId, spanId: span.spanId, end: () => {}, fail: () => {} }
  },
  addCount: () => {},
  recordHistogram: () => {},
  emitLog: () => {},
  flush: async () => {},
  close: async () => {},
}

const traced = fixture(testApp([notifyPartner(partner)], { exporter }))
const untraced = fixture(testApp([notifyPartner(partner)]))

it("traces an outside call as a child of the handling that makes it, and hands its traceparent on", async () => {
  const pingId = Bun.randomUUIDv7()
  await traced.when(command(NotifyPartner, { pingId })).then(events(event(PartnerNotified, { pingId })))

  const call = spans.find((s) => s.name === "partner.notify")!
  expect(call.kind).toBe(SpanKind.CLIENT)
  const handling = spans.find((s) => s.spanId === call.parent?.spanId)
  expect(handling).toBeDefined()
  expect(call.traceId).toBe(handling!.traceId)
  expect(sent.find((s) => s.id === pingId)?.traceparent).toBe(`00-${call.traceId}-${call.spanId}-01`)
})

it("hands a client a trace without an exporter too: one that records nothing", async () => {
  const pingId = Bun.randomUUIDv7()
  await untraced.when(command(NotifyPartner, { pingId })).then(events(event(PartnerNotified, { pingId })))
  expect(sent.find((s) => s.id === pingId)).toEqual({ id: pingId, traceparent: undefined })
})
