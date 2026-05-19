import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Session } from "@/session/session"
import { MessageV2 } from "../session/message-v2"
import { PartID } from "../session/schema"
import DESCRIPTION from "./render_html.txt"

export const Parameters = Schema.Struct({
  html: Schema.String.annotate({
    description: "HTML content to render inline in the chat",
  }),
  title: Schema.optional(Schema.String).annotate({
    description: "Optional display title for the rendered content",
  }),
  height: Schema.optional(Schema.String).annotate({
    description: 'CSS height string with units, e.g. "400px" or "50vh". MUST be a string, not a bare number.',
  }),
})

export const RenderHtmlTool = Tool.define(
  "render_html",
  Effect.gen(function* () {
    const session = yield* Session.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const part: MessageV2.HtmlPart = {
            id: PartID.ascending(),
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "html",
            html: params.html,
            title: params.title,
            height: params.height,
          }

          yield* session.updatePart(part)

          return {
            title: "HTML rendered",
            output: "HTML content displayed inline in message",
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
