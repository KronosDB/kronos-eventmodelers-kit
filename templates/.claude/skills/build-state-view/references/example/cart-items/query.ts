import { result } from "#kit/result"
import { z } from "zod"
import { ns } from "../events"

/** One item as the cart shows it. */
export const CartItem = z.object({
  itemId: z.uuid().meta({ description: "The item in the cart." }),
  productId: z.uuid().meta({ description: "The product the item is." }),
  description: z.string().meta({ description: "The product's name.", examples: ["Running shoes"] }),
  image: z.string().meta({ description: "The product's picture.", examples: ["shoes.png"] }),
  price: z.number().meta({ description: "The price the item was added at.", examples: [49.9] }),
})
export type CartItem = z.infer<typeof CartItem>

/** A cart's items and what they cost together. An unknown cart is an empty one. */
export const GetCartItems = ns.query("GetCartItems", {
  payload: z.object({ aggregateId: z.uuid().meta({ description: "The cart.", examples: ["0192f3a0-0000-7000-8000-000000000001"] }) }),
  result: result({
    aggregateId: z.uuid().meta({ description: "The cart." }),
    items: z.array(CartItem).meta({ description: "The items in the cart, oldest first." }),
    totalPrice: z.number().meta({ description: "What the items cost together.", examples: [99.8] }),
  }),
})

/**
 * What the projection emits to a cart's subscribers: the row a write touched, as `returning()` gives it back. A list
 * view streams its rows' changes, not the whole list again; the subscriber keeps the list (and its total) itself.
 */
export const CartItemsUpdate = z.discriminatedUnion("change", [
  z.object({ change: z.literal("added"), item: CartItem }),
  z.object({ change: z.literal("removed"), itemId: z.uuid() }),
])
export type CartItemsUpdate = z.infer<typeof CartItemsUpdate>
