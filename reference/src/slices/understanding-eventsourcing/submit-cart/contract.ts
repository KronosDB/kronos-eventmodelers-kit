import { errorsOf, statusesOf } from "#kit/problems"
import { oc } from "@orpc/contract"
import { openapi } from "@orpc/openapi"
import { z } from "zod"
import { SubmitCart } from "./command"

/** What the caller sends: the command's payload, as is. */
export const Request = SubmitCart.payload
/** The command answers only whether it landed; readers follow the views. */
export const Response = z.object({})

const submitCart = oc
  .meta(
    openapi({
      method: "POST",
      path: "/understanding-eventsourcing/submit-cart",
      tags: ["Submit Cart"],
      summary: "Submit a cart",
      description: "Places the order for the cart's products. A submitted cart is published to the shop's systems.",
    }),
  )
  .errors(errorsOf(SubmitCart))
  .input(Request)
  .output(Response)

/** HTTP only, beside the route's method and path: what each rejection answers with. */
export const statuses = statusesOf(SubmitCart, { CART_EMPTY: 409 })

export const contract = { submitCart }
