import { describe, it, expect } from "vitest";
import {
  API_KEY_PLACEHOLDER,
  FLAG_SAMPLE_LANGUAGES,
  buildFlagSample,
  evalType,
  type EvalType,
} from "./flag-code-samples";
import { CODE_SAMPLES } from "../flagsets/code-samples";
import { REGISTERED_LANGUAGES } from "@/components/ui/code-block";

// The typed evaluation method each language must use per flag type. JS-family
// SDKs (node, javascript, react, angular) and Ruby collapse int+float into a
// single number method.
const EXPECTED_METHOD: Record<string, Record<EvalType, string>> = {
  go: {
    boolean: "BooleanValue",
    string: "StringValue",
    int: "IntValue",
    float: "FloatValue",
    json: "ObjectValue",
  },
  java: {
    boolean: "getBooleanValue",
    string: "getStringValue",
    int: "getIntegerValue",
    float: "getDoubleValue",
    json: "getObjectValue",
  },
  dotnet: {
    boolean: "GetBooleanValueAsync",
    string: "GetStringValueAsync",
    int: "GetIntegerValueAsync",
    float: "GetDoubleValueAsync",
    json: "GetObjectValueAsync",
  },
  python: {
    boolean: "get_boolean_value",
    string: "get_string_value",
    int: "get_integer_value",
    float: "get_float_value",
    json: "get_object_value",
  },
  node: {
    boolean: "getBooleanValue",
    string: "getStringValue",
    int: "getNumberValue",
    float: "getNumberValue",
    json: "getObjectValue",
  },
  javascript: {
    boolean: "getBooleanValue",
    string: "getStringValue",
    int: "getNumberValue",
    float: "getNumberValue",
    json: "getObjectValue",
  },
  react: {
    boolean: "useBooleanFlagValue",
    string: "useStringFlagValue",
    int: "useNumberFlagValue",
    float: "useNumberFlagValue",
    json: "useObjectFlagValue",
  },
  angular: {
    boolean: "getBooleanDetails",
    string: "getStringDetails",
    int: "getNumberDetails",
    float: "getNumberDetails",
    json: "getObjectDetails",
  },
  android: {
    boolean: "getBooleanValue",
    string: "getStringValue",
    int: "getIntegerValue",
    float: "getDoubleValue",
    json: "getObjectValue",
  },
  swift: {
    boolean: "getBooleanValue",
    string: "getStringValue",
    int: "getIntegerValue",
    float: "getDoubleValue",
    json: "getObjectValue",
  },
  php: {
    boolean: "getBooleanValue",
    string: "getStringValue",
    int: "getIntegerValue",
    float: "getFloatValue",
    json: "getObjectValue",
  },
  ruby: {
    boolean: "fetch_boolean_value",
    string: "fetch_string_value",
    int: "fetch_number_value",
    float: "fetch_number_value",
    json: "fetch_object_value",
  },
};

const TYPES: EvalType[] = ["boolean", "string", "int", "float", "json"];

describe("evalType", () => {
  it("passes through known value types", () => {
    expect(evalType("string")).toBe("string");
    expect(evalType("int")).toBe("int");
    expect(evalType("float")).toBe("float");
    expect(evalType("json")).toBe("json");
    expect(evalType("boolean")).toBe("boolean");
  });

  it("falls back to boolean for an unknown (variation-less) flag", () => {
    expect(evalType("unknown")).toBe("boolean");
  });
});

describe("buildFlagSample", () => {
  it("offers every language registered with the highlighter", () => {
    const registered = new Set(REGISTERED_LANGUAGES);
    for (const { id } of FLAG_SAMPLE_LANGUAGES) {
      const sample = buildFlagSample(id, "my-flag", "boolean");
      expect(
        registered.has(sample.lang),
        `sample "${id}" uses unregistered lang "${sample.lang}"`,
      ).toBe(true);
    }
  });

  it("keeps the API key placeholder so a key can be injected", () => {
    for (const { id } of FLAG_SAMPLE_LANGUAGES) {
      const { code } = buildFlagSample(id, "my-flag", "boolean");
      expect(code, `sample "${id}"`).toContain(API_KEY_PLACEHOLDER);
    }
  });

  it("embeds the flag name in the evaluation call", () => {
    for (const { id } of FLAG_SAMPLE_LANGUAGES) {
      const { code } = buildFlagSample(id, "checkout-redesign", "boolean");
      expect(code, `sample "${id}"`).toContain("checkout-redesign");
    }
  });

  it("uses the type-correct evaluation method for every language and type", () => {
    for (const { id } of FLAG_SAMPLE_LANGUAGES) {
      for (const type of TYPES) {
        const { code } = buildFlagSample(id, "my-flag", type);
        const method = EXPECTED_METHOD[id][type];
        expect(
          code,
          `sample "${id}" / ${type} should call ${method}`,
        ).toContain(method);
      }
    }
  });

  it("includes the provider-init setup before the evaluation", () => {
    // Go provider init is the reused flagset snippet; evaluation is appended.
    const { code } = buildFlagSample("go", "my-flag", "boolean");
    expect(code).toContain("gofeatureflag.NewProviderWithContext");
    expect(code.indexOf("NewProviderWithContext")).toBeLessThan(
      code.indexOf("BooleanValue"),
    );
  });

  it("treats an unknown flag type as boolean", () => {
    const { code } = buildFlagSample("go", "my-flag", "unknown");
    expect(code).toContain("BooleanValue");
  });

  it("falls back to the first language for an unknown id", () => {
    const sample = buildFlagSample("does-not-exist", "my-flag", "boolean");
    expect(sample.id).toBe(FLAG_SAMPLE_LANGUAGES[0].id);
  });

  it("escapes quotes/backslashes/newlines in the flag name so the literal stays valid", () => {
    // Flag names aren't restricted to an identifier charset — a quote or
    // backslash must not break the double-quoted string literal in the snippet.
    const { code } = buildFlagSample("go", 'a"b\\c', "boolean");
    expect(code).toContain('a\\"b\\\\c');

    const nl = buildFlagSample("node", "a\nb", "boolean").code;
    expect(nl).toContain("a\\nb");
    expect(nl).not.toContain("a\nb");
  });

  it("keeps the Go name out of the Printf format string so `%` is safe", () => {
    // A name like `rollout-50%` must not inject a Printf verb (go vet error).
    const { code } = buildFlagSample("go", "rollout-50%", "boolean");
    expect(code).toContain('client.BooleanValue(ctx, "rollout-50%", false, evalCtx)');
    expect(code).toContain('fmt.Printf("flag value: %v\\n", value)');
    expect(code).not.toContain('"rollout-50% = %v');
  });

  it("escapes `$` in the PHP literal so it doesn't interpolate", () => {
    const { code } = buildFlagSample("php", "price-$x", "boolean");
    expect(code).toContain('"price-\\$x"');
  });

  it("escapes `#` in the Ruby literal so `#{}` doesn't interpolate", () => {
    const { code } = buildFlagSample("ruby", "item#{id}", "boolean");
    expect(code).toContain('flag_key: "item\\#{id}"');
  });

  it("appends a non-empty evaluation block for every offered language", () => {
    // Guards against CODE_SAMPLES / EVALUATIONS drift: a language present in the
    // picker but missing an evaluation builder would silently render init-only.
    for (const { id } of FLAG_SAMPLE_LANGUAGES) {
      const base = CODE_SAMPLES.find((s) => s.id === id)!;
      const { code } = buildFlagSample(id, "my-flag", "boolean");
      expect(
        code.length,
        `sample "${id}" must append an evaluation block`,
      ).toBeGreaterThan(base.code.length + 2);
    }
  });
});
