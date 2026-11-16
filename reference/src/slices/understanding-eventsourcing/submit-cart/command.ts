import { rejection, result } from "#kit/result"
import { z } from "zod"
import { OrderedProduct, ns } from "../events"

/** Submit a cart: the products ordered, as the customer confirmed them. */
export const SubmitCart = ns.command("SubmitCart", {
  payload: z.object({ aggregateId: z.uuid(), orderedProducts: z.array(OrderedProduct) }),
  // A cart is submitted with at least one product.
  result: result({}, rejection("CART_EMPTY", { aggregateId: z.uuid() })),
})
