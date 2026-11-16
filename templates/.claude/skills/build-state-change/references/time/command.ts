import { rejection, result } from "#kit/result"
import { z } from "zod"
import { ns } from "./events"

/** Remind the customer of an order, at most once in 24 hours. */
export const SendReminder = ns.command("SendReminder", {
  payload: z.object({ orderId: z.uuid() }),
  result: result(
    {},
    rejection("REMINDED_RECENTLY", {
      facts: {
        orderId: z.uuid().meta({ description: "The order.", examples: ["0192f3a0-0000-7000-8000-000000000301"] }),
        nextAt: z.iso
          .datetime({ offset: true })
          .meta({ description: "When the next reminder can go.", examples: ["2026-01-02T09:00:00+01:00"] }),
      },
      title: "A reminder was sent recently",
      detail: (f) => `Order ${f.orderId} was reminded less than 24 hours ago; the next reminder can go at ${f.nextAt}.`,
      happened: "No reminder was sent, because an order is reminded at most once in 24 hours.",
      causes: ["A reminder for this order went out less than 24 hours ago."],
      resolution: ["Send the reminder at or after the time given."],
    }),
  ),
})
