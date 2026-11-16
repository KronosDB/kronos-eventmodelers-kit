import { z } from "zod"
import type { Rejection } from "./result"

/** A command or query descriptor whose result declares its rejections (`result(success, ...rejections)`). */
type Refusing = { readonly name: { readonly name: string }; readonly result?: { readonly rejections: readonly Rejection[] } }
type CodeOf<D extends Refusing> = NonNullable<D["result"]>["rejections"][number]["code"]

const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replaceAll("_", "-").toLowerCase()

/**
 * A rejection's problem type: it belongs to the message that declares it, so two slices refusing with the same code
 * are two problems, each with its own words. `ChangePassword`'s `PASSWORD_TOO_SHORT` is
 * `/problems/change-password/password-too-short`; it names the problem and is where it is documented.
 */
export const problemTypeOf = (descriptor: Refusing, code: string) => `/problems/${kebab(descriptor.name.name)}/${kebab(code)}`

/** An example value for a JSON Schema: its own example, or one by its type and format. */
function exampleOf(schema: Record<string, unknown>): unknown {
  const examples = schema.examples as unknown[] | undefined
  if (examples?.length) return examples[0]
  if ("const" in schema) return schema.const
  switch (schema.type) {
    case "string":
      switch (schema.format) {
        case "uuid":
          return "0192f3a0-0000-7000-8000-000000000001"
        case "date-time":
          return "2026-01-01T12:00:00Z"
        case "date":
          return "2026-01-01"
        case "email":
          return "member@example.com"
        case "uri":
          return "https://example.com"
        default:
          return "…"
      }
    case "integer":
    case "number":
      return 1
    case "boolean":
      return true
    case "array":
      return [exampleOf((schema.items ?? {}) as Record<string, unknown>)]
    case "object":
      return Object.fromEntries(
        Object.entries((schema.properties ?? {}) as Record<string, Record<string, unknown>>).map(([k, v]) => [k, exampleOf(v)]),
      )
    default:
      return null
  }
}

/** A rejection's data as a client receives it, with example facts: what the API reference shows for it. */
function exampleDataOf(type: string, r: Rejection): Record<string, unknown> {
  const facts = exampleOf(z.toJSONSchema(z.object(r.facts)) as Record<string, unknown>) as Record<string, unknown>
  const detail = r.detail(facts as never)
  const { title, happened, causes, resolution } = r
  return { type, title, detail, instance: "0192f3a0-0000-7000-8000-0000000000aa", happened, causes, resolution, ...facts }
}

/**
 * A contract's `.errors(…)`: one per rejection the descriptor declares, its data the rejection's problem type, words
 * and facts and the request's correlation id as `instance`. Protocol-neutral: what a rejection is worth over HTTP is
 * `statusesOf`.
 */
export function errorsOf<const D extends Refusing>(descriptor: D) {
  const errors = (descriptor.result?.rejections ?? []).map((r) => [
    r.code,
    {
      message: r.title,
      data: z
        .object({
          type: z.literal(problemTypeOf(descriptor, r.code)),
          title: z.literal(r.title),
          detail: z.string(),
          instance: z.string(),
          happened: z.string(),
          causes: z.array(z.string()),
          resolution: z.array(z.string()),
          ...r.facts,
        })
        // The rejection's own words, so the API reference explains each refusal, not just its title.
        .meta({
          title: r.title,
          description: [r.happened, `Causes: ${r.causes.join(" ")}`, `Resolution: ${r.resolution.join(" ")}`].join("\n\n"),
          examples: [exampleDataOf(problemTypeOf(descriptor, r.code), r)],
        }),
    },
  ])
  return Object.fromEntries(errors) as { [K in CodeOf<D>]: { message: string; data: z.ZodObject } }
}

/**
 * HTTP only: the status each of a descriptor's rejections answers with, beside the route's method and path. It does
 * not compile unless every rejection has one and no other code appears. An MCP edge ignores it. oRPC maps a status by
 * code alone, so a code another slice also refuses with answers the same status there (`slices/index.ts` checks).
 */
export const statusesOf = <
  const D extends Refusing,
  const S extends Record<CodeOf<D>, number> & Record<Exclude<keyof S, CodeOf<D>>, never>,
>(_descriptor: D, statuses: S): Readonly<Record<string, number>> => statuses

/**
 * What the domain answered, as the contract's declared error, to throw from a controller:
 * `if (!result.ok) throw refuse(call, AddItem, result)`.
 */
export function refuse<D extends Refusing>(
  call: {
    // `any`: oRPC builds one constructor per code, each typed to its own data; the data is built right here.
    readonly errors: { readonly [K in CodeOf<D>]: (options: { message: string; data: any }) => Error }
    readonly context: { readonly correlationId: string }
  },
  descriptor: D,
  answer: { readonly ok: false; readonly rejection: CodeOf<D> },
): Error {
  const { ok: _, rejection: code, ...facts } = answer
  const r = descriptor.result!.rejections.find((r) => r.code === code)!
  const detail = r.detail(facts)
  const { title, happened, causes, resolution } = r
  return call.errors[code]({
    message: detail,
    data: { ...facts, type: problemTypeOf(descriptor, code), title, detail, instance: call.context.correlationId, happened, causes, resolution },
  })
}
