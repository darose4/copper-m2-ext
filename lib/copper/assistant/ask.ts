"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress } from "@/lib/copper/assistant/progress";
import { extendedTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const APOLOGY = "Sorry, I couldn't answer that. Please try again.";

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = { steps: [], reply: "", status: "working" };

  // Every update is a fresh copy, so earlier updates never change underneath
  // whoever is holding them.
  const snapshot = (): Progress => ({
    steps: progress.steps.map((step) => ({ ...step })),
    reply: progress.reply,
    status: progress.status,
  });

  async function run() {
    try {
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        {
          messages: request.messages,
          providerOptions: THOUGHT_SUMMARIES,
          // With tools off the model gets only the conversation: no
          // instructions and no tools, so nothing tells it to check anything.
          ...(request.useTools
            ? {
                instructions: COPPER_INSTRUCTIONS,
                tools: extendedTools,
                stopWhen: stepCountIs(MAX_STEPS),
              }
            : {}),
        },
      );

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            const last = progress.steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else progress.steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start":
            // The tool is named before its input is known.
            progress.steps.push({
              type: "tool",
              id: part.id,
              name: part.toolName,
              state: "calling",
            });
            break;
          case "tool-call": {
            const step = toolStep(part.toolCallId);
            if (step) step.input = part.input;
            else
              progress.steps.push({
                type: "tool",
                id: part.toolCallId,
                name: part.toolName,
                state: "calling",
                input: part.input,
              });
            break;
          }
          case "tool-result": {
            const step = toolStep(part.toolCallId);
            if (step) {
              step.output = part.output;
              step.state = "done";
            }
            break;
          }
          case "tool-error": {
            const step = toolStep(part.toolCallId);
            if (step) {
              step.output =
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error);
              step.state = "error";
            }
            break;
          }
          case "text-delta":
            progress.reply += part.text;
            break;
          case "error":
            console.error("[askCopper] the model stream failed:", part.error);
            progress.status = "error";
            break;
          default:
            continue;
        }
        update(snapshot());
      }

      if (progress.status === "working") progress.status = "done";
      // A stream that ends normally with no words still ends well.
      if (!progress.reply) progress.reply = APOLOGY;
    } catch (error) {
      console.error("[askCopper] the question failed:", error);
      progress.status = "error";
      if (!progress.reply) progress.reply = APOLOGY;
    }
    done(snapshot());
  }

  function toolStep(id: string) {
    return progress.steps.find(
      (step): step is Extract<Progress["steps"][number], { type: "tool" }> =>
        step.type === "tool" && step.id === id,
    );
  }

  // Return straight away and read the stream in the background.
  void run();
  return { progress: live };
}
