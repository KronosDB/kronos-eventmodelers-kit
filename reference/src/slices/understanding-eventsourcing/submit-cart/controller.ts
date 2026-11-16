import { type Edge, refuse } from "#kit"
import { implement } from "@orpc/server"
import { SubmitCart } from "./command"
import { contract } from "./contract"

export const router = {
  submitCart: implement(contract).$context<Edge>().submitCart.handler(async (call) => {
    const result = await call.context.send(SubmitCart, call.input)
    if (!result.ok) throw refuse(call, SubmitCart, result)
    return {}
  }),
}
