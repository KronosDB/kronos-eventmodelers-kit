import { expect, it } from "bun:test"
import { testApp } from "#test"
import { command, commands, event, events, fixture, noEvents, result } from "@kronos-ts/test"
import { CartPublished, CartSubmitted } from "../events"
import { PublishCart } from "./command"
import { publishCart } from "."
import { handle } from "./handler"
import type { CartPublisher } from "./publisher"

// Two fixtures. The command's decisions run on the command handler alone: in the whole slice the automation would act
// on a `given` CartSubmitted, as it does in production, and the command would find the cart published already. The
// automation runs on the whole slice.
// The external system, recorded: what the automation handed it. It runs in the trace it is handed, as a real client
// does: every handling has one, recording nothing without an exporter.
const published: Parameters<CartPublisher["publish"]>[0][] = []
const recording: CartPublisher = { publish: (cart, ctx) => ctx.trace.run("cart-publisher.publish", async () => void published.push(cart)) }
const decisions = fixture(testApp([{ commandHandlers: [handle] }]))
const scenarios = fixture(testApp([publishCart(recording)], { db: true }))

// Every scenario shares the app, so each one submits a cart of its own.
const submitted = (aggregateId: string) => ({
  aggregateId,
  orderedProducts: [{ productId: Bun.randomUUIDv7(), price: 49.9 }],
  totalPrice: 49.9,
})

it("publishes a cart", async () => {
  const aggregateId = Bun.randomUUIDv7()
  await decisions
    .when(command(PublishCart, submitted(aggregateId)))
    .then(result({ ok: true }), events(event(CartPublished, { aggregateId })))
})

it("lands once when the cart is published already", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const cart = submitted(aggregateId)
  await decisions
    .given(event(CartSubmitted, cart), event(CartPublished, { aggregateId }))
    .when(command(PublishCart, cart))
    .then(result({ ok: true }), noEvents())
})

it("publishes the cart when it is submitted", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const cart = submitted(aggregateId)
  const arrived = event(CartSubmitted, cart)
  await scenarios
    .when(arrived)
    .then(commands(command(PublishCart, cart)), events(arrived, event(CartPublished, { aggregateId })))
  expect(published.filter((p) => p.aggregateId === aggregateId)).toEqual([cart])
})

it("publishes as itself: the automation is the actor, and whoever submitted the cart is reached by the correlation", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const cart = submitted(aggregateId)
  const member = { actor: "member-1", actorType: "user", correlationId: `submit-${aggregateId}` }
  const itself = { actor: "publish-cart", actorType: "automation", correlationId: member.correlationId }
  await scenarios
    .when(event(CartSubmitted, cart, member))
    .then(commands(command(PublishCart, cart, itself)), events(event(CartSubmitted, cart, member), event(CartPublished, { aggregateId }, itself)))
})
