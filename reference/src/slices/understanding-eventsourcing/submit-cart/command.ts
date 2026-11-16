import { rejection, result } from "#kit/result"
import { z } from "zod"
import { OrderedProduct, ns } from "../events"

/** Submit a cart: the products ordered, as the customer confirmed them. */
export const SubmitCart = ns.command("SubmitCart", {
  payload: z.object({
    aggregateId: z.uuid().meta({ description: "The cart being submitted.", examples: ["0192f3a0-0000-7000-8000-000000000001"] }),
    orderedProducts: z
      .array(OrderedProduct)
      .meta({ description: "The products ordered, as the customer confirmed them, each at its price." }),
  }),
  result: result(
    {},
    rejection("CART_EMPTY", {
      facts: { aggregateId: z.uuid().meta({ description: "The cart.", examples: ["0192f3a0-0000-7000-8000-000000000001"] }) },
      title: "The cart is empty",
      detail: (f) => `Cart ${f.aggregateId} has no products to submit.`,
      happened: "The cart was not submitted, because a cart is submitted with at least one product.",
      causes: ["No products were ordered."],
      resolution: ["Add an item to the cart, then submit it."],
    }),
  ),
})
