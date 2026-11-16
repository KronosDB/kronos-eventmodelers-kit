import { eventIterator, oc } from "@orpc/contract"
import { openapi } from "@orpc/openapi"
import { z } from "zod"
import { CartItemsUpdate, GetCartItems } from "./query"

/** What the caller asks with: the query's payload, as is. */
export const Request = GetCartItems.payload
/** The answer: what the query's success carries, as is. */
export const Response = GetCartItems.result.success

/** The stream: the cart as the plain query answers it first, then each item added or removed. */
export const StreamEvent = z.union([z.object({ change: z.literal("snapshot"), cart: Response }), CartItemsUpdate])

const cartItems = oc
  .meta(
    openapi({
      method: "GET",
      path: "/understanding-eventsourcing/cart-items",
      tags: ["Cart Items"],
      summary: "A cart's items and their total",
      description: "The items in a customer's cart and what they cost together. An unknown cart answers an empty one.",
    }),
  )
  .input(Request)
  .output(Response)

/** The same view, live (Server-Sent Events): the snapshot, then every change until the client goes away. */
const cartItemsStream = oc
  .meta(
    openapi({
      method: "GET",
      path: "/understanding-eventsourcing/cart-items/stream",
      tags: ["Cart Items"],
      summary: "A cart's items, live",
      description:
        "The same view as a stream (Server-Sent Events): first `snapshot`, the cart as the plain query answers it, then `added` or `removed` for each item that comes or goes (an automation archives items while the cart is open), until the client goes away.",
    }),
  )
  .input(Request)
  .output(eventIterator(StreamEvent))

export const contract = { cartItems, cartItemsStream }
