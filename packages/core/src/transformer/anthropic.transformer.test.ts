import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicTransformer } from "./anthropic.transformer";
import { normalizeToolSchema } from "../utils/tool-schema";

const pattern = String.raw`^(?!.*$)[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}"\\./[\]]{1,200}$`;
const enabledPattern = String.raw`^(?!__.*__$)[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}"\\./[\]]{1,200}$`;

test("Artifact tool patterns are normalized without changing constraints or input data", async () => {
  const name = { type: "string", pattern, minLength: 1, maxLength: 200 };
  const input_schema = {
    type: "object",
    properties: {
      name,
      pattern: name,
      nested: { type: "array", items: { anyOf: [name, { type: "null" }] } },
      ordinary: { type: "string", pattern: "^[a-z]+$" },
    },
    $defs: { name },
    additionalProperties: false,
    required: ["name"],
    default: { pattern },
    examples: [{ pattern }],
  };
  const original = structuredClone(input_schema);
  const request = await new AnthropicTransformer().transformRequestOut({
    model: "gpt-5.5-2026-04-24",
    messages: [{ role: "user", content: "hello" }],
    tools: [{ name: "Artifact", description: "Artifact tool", input_schema }],
  });
  const tool = request.tools![0];
  const parameters = tool.function.parameters;
  const expected = { ...name, pattern: parameters.properties.name.pattern };
  assert.notEqual(expected.pattern, pattern);
  assert.equal(expected.pattern.includes(String.raw`\p{`), false);
  assert.equal(tool.function.name, "Artifact");
  assert.deepEqual(parameters.properties.name, expected);
  assert.deepEqual(parameters.properties.pattern, expected);
  assert.deepEqual(parameters.properties.nested.items.anyOf, [expected, { type: "null" }]);
  assert.deepEqual(parameters.$defs.name, expected);
  assert.deepEqual(parameters.properties.ordinary, original.properties.ordinary);
  assert.deepEqual(parameters.required, ["name"]);
  assert.equal(parameters.additionalProperties, false);
  assert.deepEqual(parameters.default, original.default);
  assert.deepEqual(parameters.examples, original.examples);
  assert.deepEqual(input_schema, original);

  const regex = new RegExp(parameters.properties.name.pattern, "u");
  for (const value of ["", "artifact", "中文", "a/b", "\n", "a\nb", "\r", "\u2028", "\u2029", "😀"]) {
    assert.equal(regex.test(value), false);
  }
});

test("Artifact enabled names retain reserved-name, character and length constraints", async () => {
  const request = await new AnthropicTransformer().transformRequestOut({
    model: "gpt-5.5-2026-04-24",
    messages: [{ role: "user", content: "hello" }],
    tools: [{
      name: "Artifact",
      input_schema: { type: "object", properties: { name: { type: "string", pattern: enabledPattern } } },
    }],
  });
  const pattern = request.tools![0].function.parameters.properties.name.pattern;
  assert.equal(pattern.startsWith("^(?!__.*__$)"), true);
  assert.equal(pattern.includes(String.raw`\p{`), false);
  const regex = new RegExp(pattern, "u");
  for (const name of ["artifact", "中文名称", "😀", "a_b-c", "__name", "name__", "a".repeat(200)]) {
    assert.equal(regex.test(name), true, JSON.stringify(name));
  }
  for (const name of ["", "__name__", "____", "a/b", "a.b", "a\\b", 'a"b', "a[b", "a]b", "a\nb", "a\u200bb", "a\u2028b", "a\u{e0001}b", "a".repeat(201)]) {
    assert.equal(regex.test(name), false, JSON.stringify(name));
  }
});

test("portable character ranges agree with Unicode categories for every code point", () => {
  const { pattern } = normalizeToolSchema({ pattern: enabledPattern });
  const regex = new RegExp(pattern, "u");
  const forbidden = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}"\\./\[\]]/u;
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
    const character = String.fromCodePoint(codePoint);
    assert.equal(regex.test(character), !forbidden.test(character), `U+${codePoint.toString(16)}`);
  }
});

test("requests without tools still convert", async () => {
  const request = await new AnthropicTransformer().transformRequestOut({
    model: "test",
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(request.tools, undefined);
});
