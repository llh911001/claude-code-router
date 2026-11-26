import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicTransformer } from "./anthropic.transformer";
import { OpenAIResponsesTransformer } from "./openai.responses.transformer";
import type { UnifiedChatRequest } from "../types/llm";

const transformer = new OpenAIResponsesTransformer();

// The transformer returns a Responses payload through the unified request interface.
async function toResponses(request: UnifiedChatRequest) {
  return await transformer.transformRequestIn(request) as unknown as {
    input: Record<string, unknown>[];
    instructions?: string;
    reasoning?: { effort?: string; summary?: string };
    messages?: unknown;
  };
}

test("Anthropic thinking history does not leak into Responses input", async () => {
  const request = await new AnthropicTransformer().transformRequestOut({
    model: "test",
    thinking: { type: "enabled", budget_tokens: 8192 },
    messages: [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "internal reasoning", signature: "signature" },
          { type: "text", text: "answer" },
        ],
      },
      { role: "user", content: "continue" },
    ],
  });
  assert.ok(request.messages[1].thinking);

  const response = await toResponses(request);
  assert.deepEqual(response.input, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "continue" },
  ]);
  assert.deepEqual(response.reasoning, { effort: "medium", summary: "detailed" });
  assert.equal(response.messages, undefined);
  assert.equal(JSON.stringify(response.input).includes("internal reasoning"), false);
});

test("message metadata is excluded while text and images retain their API format", async () => {
  const response = await toResponses({
    model: "test",
    messages: [
      { role: "system", content: "instructions" },
      {
        role: "user",
        cache_control: { type: "ephemeral" },
        content: [
          { type: "text", text: "question", cache_control: { type: "ephemeral" } },
          { type: "image_url", image_url: { url: "https://example.com/image.png" }, media_type: "image/png" },
        ],
      },
      {
        role: "assistant",
        thinking: { content: "reasoning", signature: "signature" },
        cache_control: { type: "ephemeral" },
        content: [{ type: "text", text: "answer" }],
      },
    ],
  });
  assert.equal(response.instructions, "instructions");
  assert.deepEqual(response.input, [
    {
      role: "user",
      content: [
        { type: "input_text", text: "question" },
        { type: "input_image", image_url: "https://example.com/image.png" },
      ],
    },
    { role: "assistant", content: [{ type: "output_text", text: "answer" }] },
  ]);
});

test("function calls and outputs retain their fields without unified metadata", async () => {
  const response = await toResponses({
    model: "test",
    messages: [
      {
        role: "assistant",
        content: "",
        thinking: { content: "reasoning" },
        tool_calls: [{ id: "call_1", type: "function", function: { name: "Read", arguments: '{"path":"file"}' } }],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "file contents",
        cache_control: { type: "ephemeral" },
        thinking: { content: "internal metadata" },
      },
    ],
  });
  assert.deepEqual(response.input, [
    { type: "function_call", name: "Read", arguments: '{"path":"file"}', call_id: "call_1" },
    { type: "function_call_output", call_id: "call_1", output: "file contents" },
  ]);
});

test("ordinary messages are unchanged", async () => {
  const response = await toResponses({
    model: "test",
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "answer" },
    ],
  });
  assert.deepEqual(response.input, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "answer" },
  ]);
});
