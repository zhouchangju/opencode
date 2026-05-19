import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Session } from "@/session/session"
import { MessageV2 } from "../session/message-v2"
import { PartID } from "../session/schema"
import DESCRIPTION from "./render_jgy.txt"

export const Parameters = Schema.Struct({
  answer: Schema.Record(Schema.String, Schema.Any).annotate({
    description: "AIME answer JSON from chart-visualization skill (the JSON after JGY_JSON: prefix)",
  }),
  sourceType: Schema.optional(Schema.String).annotate({
    description: "Business type: Iwencai (domestic) or Ainvest (overseas). Default: Iwencai",
  }),
  businessConfig: Schema.optional(Schema.Record(Schema.String, Schema.Any)).annotate({
    description: "Custom configuration for components (hiddenTitle, chartTouchOpen, etc.)",
  }),
})

export const RenderJgyTool = Tool.define(
  "render_jgy",
  Effect.gen(function* () {
    const session = yield* Session.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const part: MessageV2.JgyPart = {
            id: PartID.ascending(),
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "jgy",
            answer: params.answer,
            sourceType: params.sourceType ?? "Iwencai",
            businessConfig: params.businessConfig ?? {},
          }

          yield* session.updatePart(part)

          return {
            title: "Chart rendered",
            output: "Chart displayed inline in message",
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
