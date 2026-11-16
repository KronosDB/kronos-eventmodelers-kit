import { errorsOf, statusesOf } from "#kit/problems"
import { oc } from "@orpc/contract"
import { openapi } from "@orpc/openapi"
import { z } from "zod"
import { AddItem } from "./command"

/** What the caller sends: the command's payload, as is. */
export const Request = AddItem.payload
/** The command answers only whether it landed; readers follow the views. */
export const Response = z.object({})

const addItem = oc
  .meta(
    openapi({
      method: "POST",
      path: "/understanding-eventsourcing/add-item",
      tags: ["Add Item"],
      summary: "Add an item to a cart",
      description: "Puts a product in the customer's cart. The first item creates the cart; a cart holds at most three items.",
    }),
  )
  .errors(errorsOf(AddItem))
  .input(Request)
  .output(Response)

/** HTTP only, beside the route's method and path: what each rejection answers with. */
export const statuses = statusesOf(AddItem, { CART_FULL: 409 })

export const contract = { addItem }
