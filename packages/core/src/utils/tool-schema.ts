// Normalize the shared Artifact name character class, regardless of its lookahead.
const ARTIFACT_NAME_CHARACTER_CLASS =
  String.raw`[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}"\\./[\]]`;

// Unicode 17.0 Cc, Cf, Zl and Zp ranges. Astral characters are literal code points
// at runtime so validators do not need JavaScript's \p{} or \u{} regex syntax.
const PORTABLE_NAME_CHARACTER_CLASS = "[^" +
  String.raw`\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0605\u061c\u06dd\u070f` +
  String.raw`\u0890-\u0891\u08e2\u180e\u200b-\u200f\u2028-\u202e` +
  String.raw`\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb` +
  "\u{110bd}\u{110cd}\u{13430}-\u{1343f}\u{1bca0}-\u{1bca3}" +
  "\u{1d173}-\u{1d17a}\u{e0001}\u{e0020}-\u{e007f}" +
  String.raw`"\\./\[\]]`;

export function normalizeToolSchema(schema: any): any {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  const result = { ...schema };
  if (typeof result.pattern === "string") {
    result.pattern = result.pattern.replaceAll(
      ARTIFACT_NAME_CHARACTER_CLASS,
      PORTABLE_NAME_CHARACTER_CLASS
    );
  }

  for (const key of ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]) {
    if (schema[key] && typeof schema[key] === "object") {
      result[key] = Object.fromEntries(
        Object.entries(schema[key]).map(([name, value]) => [name, normalizeToolSchema(value)])
      );
    }
  }
  for (const key of ["items", "additionalItems", "additionalProperties", "unevaluatedProperties", "unevaluatedItems", "contains", "propertyNames", "not", "if", "then", "else", "allOf", "anyOf", "oneOf", "prefixItems"]) {
    if (key in schema) {
      result[key] = Array.isArray(schema[key])
        ? schema[key].map(normalizeToolSchema)
        : normalizeToolSchema(schema[key]);
    }
  }
  return result;
}
