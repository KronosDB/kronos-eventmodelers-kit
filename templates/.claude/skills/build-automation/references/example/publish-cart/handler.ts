import type { CommandContext } from "#kit"
import { commandHandler } from "@kronos-ts/core"
import { CartPublished } from "../events"
import { PublishCart } from "./command"
import { Publication } from "./state"

/** Record the publication once; the automation has handed the cart to the external system already. */
export const handle = commandHandler(PublishCart, async ({ payload: p }, ctx: CommandContext) => {
  const publication = await ctx.load(Publication, { aggregateId: p.aggregateId })
  if (publication.published) return { ok: true }
  ctx.append(CartPublished, { aggregateId: p.aggregateId })
  return { ok: true }
})
