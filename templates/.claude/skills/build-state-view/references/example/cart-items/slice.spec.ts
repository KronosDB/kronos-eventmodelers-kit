import { expect, it } from "bun:test"
import { testApp } from "#test"
import { consoleLogger, type SubscriptionCapableQueryBus, subscriptionQuery } from "@kronos-ts/core"
import { event, events, fixture, noEvents, query, result } from "@kronos-ts/test"
import { CartCleared, CartCreated, ItemAdded, ItemArchived, ItemRemoved } from "../events"
import { serve } from "../../../app/http"
import { GetCartItems } from "./query"
import { cartItems } from "."

const app = testApp([cartItems], { db: true })
const scenarios = fixture(app)

// Every scenario shares the app, so each one uses a cart of its own.
const item = (aggregateId: string, n: number, price: number) => ({
  aggregateId,
  itemId: Bun.randomUUIDv7(),
  productId: Bun.randomUUIDv7(),
  description: `Item ${n}`,
  image: `item-${n}.png`,
  price,
})
const row = ({ aggregateId: _, ...i }: { aggregateId: string; itemId: string; productId: string; description: string; image: string; price: number }) => i

it("is empty for a cart with no items", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const items = query(GetCartItems, { aggregateId })
  await scenarios
    .given(event(CartCreated, { aggregateId }))
    .when(items)
    .then(result({ ok: true, aggregateId, items: [], totalPrice: 0 }), noEvents())
})

it("lists the items added and their total", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const items = query(GetCartItems, { aggregateId })
  const [a, b] = [item(aggregateId, 1, 10), item(aggregateId, 2, 5.5)]
  await scenarios
    .given(event(CartCreated, { aggregateId }), event(ItemAdded, a), event(ItemAdded, b))
    .when(items)
    .then(result({ ok: true, aggregateId, items: [row(a), row(b)], totalPrice: 15.5 }))
})

it("drops removed and archived items", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const items = query(GetCartItems, { aggregateId })
  const [a, b, c] = [item(aggregateId, 3, 10), item(aggregateId, 4, 20), item(aggregateId, 5, 30)]
  await scenarios
    .given(
      event(ItemAdded, a),
      event(ItemAdded, b),
      event(ItemAdded, c),
      event(ItemRemoved, { aggregateId, itemId: a.itemId }),
      event(ItemArchived, { aggregateId, itemId: b.itemId }),
    )
    .when(items)
    .then(result({ ok: true, aggregateId, items: [row(c)], totalPrice: 30 }))
})

it("walks a cart from empty to full and back", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const items = query(GetCartItems, { aggregateId })
  const [a, b] = [item(aggregateId, 6, 10), item(aggregateId, 7, 20)]
  await scenarios
    .storyline(items)
    .shows({ ok: true, aggregateId, items: [], totalPrice: 0 })
    .after(event(ItemAdded, a), event(ItemAdded, b))
    .shows({ ok: true, aggregateId, items: [row(a), row(b)], totalPrice: 30 })
    .after(event(ItemRemoved, { aggregateId, itemId: a.itemId }))
    .shows({ ok: true, aggregateId, items: [row(b)], totalPrice: 20 })
    .after(event(CartCleared, { aggregateId }))
    .shows({ ok: true, aggregateId, items: [], totalPrice: 0 })
})

it("streams a cart's items to a subscriber: its initial state, then each item added and removed", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const a = item(aggregateId, 1, 10)
  const [bus] = (await app).queryBuses
  const live = subscriptionQuery(bus as SubscriptionCapableQueryBus, GetCartItems, { aggregateId })
  try {
    expect(await live.initialResult).toEqual({ ok: true, aggregateId, items: [], totalPrice: 0 })
    const updates = live.updates[Symbol.asyncIterator]()
    await scenarios.when(event(ItemAdded, a)).then(events(event(ItemAdded, a)))
    expect((await updates.next()).value).toEqual({ change: "added", item: row(a) })
    const removed = event(ItemRemoved, { aggregateId, itemId: a.itemId })
    await scenarios.when(removed).then(events(removed))
    expect((await updates.next()).value).toEqual({ change: "removed", itemId: a.itemId })
  } finally {
    live.close()
  }
})

it("streams over HTTP as the UI reads it: initial, then an update per change", async () => {
  const aggregateId = Bun.randomUUIDv7()
  const a = item(aggregateId, 1, 10)
  const server = await serve(await app, { router: cartItems.router, statuses: {} }, { log: consoleLogger({ write: () => {} }), port: 0 })
  const abort = new AbortController()
  try {
    const response = await fetch(new URL(`/understanding-eventsourcing/cart-items/stream?aggregateId=${aggregateId}`, server.url), {
      signal: abort.signal,
    })
    // Each Server-Sent Event's data, parsed, as they arrive.
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buffered = ""
    const next = async (): Promise<unknown> => {
      for (;;) {
        const data = buffered.match(/^data: (.*)$/m)
        if (data) {
          buffered = buffered.slice(buffered.indexOf(data[0]) + data[0].length)
          return JSON.parse(data[1]!)
        }
        buffered += (await reader.read()).value ?? ""
      }
    }
    expect(await next()).toEqual({ type: "initial", cart: { aggregateId, items: [], totalPrice: 0 } })
    await scenarios.when(event(ItemAdded, a)).then(events(event(ItemAdded, a)))
    expect(await next()).toEqual({ type: "update", change: "added", item: row(a) })
  } finally {
    abort.abort()
    await server.stop()
  }
})
