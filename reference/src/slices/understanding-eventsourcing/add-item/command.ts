import { rejection, result } from "#kit/result"
import { z } from "zod"
import { ns } from "../events"

/** Put an item in a cart. The first item creates the cart. */
export const AddItem = ns.command("AddItem", {
  payload: z.object({
    aggregateId: z.uuid().meta({ description: "The cart. The first item creates it.", examples: ["0192f3a0-0000-7000-8000-000000000001"] }),
    description: z.string().min(1).meta({ description: "The product's name, as the cart shows it.", examples: ["Running shoes"] }),
    image: z.string().min(1).meta({ description: "The product's picture.", examples: ["shoes.png"] }),
    price: z.number().meta({ description: "The price the item is added at.", examples: [49.9] }),
    itemId: z.uuid().meta({ description: "This item in the cart; minted by the client, so a retry lands once.", examples: ["0192f3a0-0000-7000-8000-000000000101"] }),
    productId: z.uuid().meta({ description: "The product the item is.", examples: ["0192f3a0-0000-7000-8000-000000000201"] }),
  }),
  result: result(
    {},
    rejection("CART_FULL", {
      facts: {
        aggregateId: z.uuid().meta({ description: "The cart.", examples: ["0192f3a0-0000-7000-8000-000000000001"] }),
        items: z.number().int().meta({ description: "How many items the cart already holds.", examples: [3] }),
      },
      title: "The cart is full",
      detail: (f) => `Cart ${f.aggregateId} already holds ${f.items} items, the most a cart can hold.`,
      happened: "The item was not added, because a cart holds at most three items.",
      causes: ["Three items are already in the cart."],
      resolution: ["Remove an item from the cart, then add this one again."],
    }),
  ),
})
