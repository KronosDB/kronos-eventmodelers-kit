import type { Slice } from "#kit"
import { automation } from "./automation"
import { handle } from "./handler"
import type { CartPublisher } from "./publisher"

/**
 * An automation and the command only it sends: no contract. What it needs from outside comes in as a parameter, from
 * the context's index.ts (the real client) or a spec (a recording one).
 */
export const publishCart = (publisher: CartPublisher) =>
  ({ commandHandlers: [handle], eventHandlers: automation(publisher) }) satisfies Slice
