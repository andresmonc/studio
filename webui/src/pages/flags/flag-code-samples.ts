// Code samples shown in the flag "Code sample" tab.
//
// Each sample = the OpenFeature provider-init snippet reused from the flagset
// "Code sample" tab (see ../flagsets/code-samples) + an evaluation block that
// reads THIS flag with the type-correct OpenFeature method and the flag's name.
//
// The evaluation method depends on the flag's value type:
//   boolean → Boolean, string → String, int → Integer, float → Float/Double,
//   json → Object. JS-family SDKs (Node, web, React, Angular) and Ruby collapse
//   int + float into a single number method.
//
// Method names and signatures are grounded in the official OpenFeature SDK and
// GO Feature Flag provider docs (https://openfeature.dev, https://gofeatureflag.org).
// Keep them in sync when the SDK APIs change — mirror the same care as
// ../flagsets/code-samples.ts.

import type { FlagType } from "@/types/api";
import {
  API_KEY_PLACEHOLDER,
  CODE_SAMPLES,
  SAMPLE_ENDPOINT,
  type CodeSample,
} from "../flagsets/code-samples";

export { API_KEY_PLACEHOLDER, SAMPLE_ENDPOINT };

/** The value types we generate an evaluation example for. */
export type EvalType = "boolean" | "string" | "int" | "float" | "json";

/**
 * Narrow a stored flag type to one we can demo. A flag with no variations yet
 * infers as "unknown" — fall back to boolean (the most common starting point).
 */
export function evalType(type: FlagType): EvalType {
  switch (type) {
    case "string":
      return "string";
    case "int":
      return "int";
    case "float":
      return "float";
    case "json":
      return "json";
    default:
      return "boolean";
  }
}

// Per-language evaluation builders. Each returns the code that follows the
// provider-init snippet and ends with the `client` (or component) already set
// up. `name` is the flag key. Client/static SDKs (web, React, Angular, Android,
// Swift) evaluate against a globally-set context; server SDKs (Go, Java, .NET,
// Python, Node, PHP, Ruby) pass the context per call.
const EVALUATIONS: Record<string, (name: string, t: EvalType) => string> = {
  go: (name, t) => {
    const m = {
      boolean: ["BooleanValue", "false"],
      string: ["StringValue", `"default"`],
      int: ["IntValue", "int64(0)"],
      float: ["FloatValue", "0.0"],
      json: ["ObjectValue", "map[string]any{}"],
    }[t];
    return `evalCtx := of.NewEvaluationContext("user-123", map[string]any{
	"email": "contact@gofeatureflag.org",
})

value, err := client.${m[0]}(ctx, "${name}", ${m[1]}, evalCtx)
if err != nil {
	// handle the error
}
fmt.Printf("flag value: %v\\n", value)`;
  },

  java: (name, t) => {
    const m = {
      boolean: ["getBooleanValue", "Boolean", "false"],
      string: ["getStringValue", "String", `"default"`],
      int: ["getIntegerValue", "Integer", "0"],
      float: ["getDoubleValue", "Double", "0.0"],
      json: ["getObjectValue", "Value", "new Value()"],
    }[t];
    return `MutableContext evalCtx = new MutableContext("user-123")
    .add("email", "contact@gofeatureflag.org");

${m[1]} value = client.${m[0]}("${name}", ${m[2]}, evalCtx);`;
  },

  dotnet: (name, t) => {
    const m = {
      boolean: ["GetBooleanValueAsync", "false"],
      string: ["GetStringValueAsync", `"default"`],
      int: ["GetIntegerValueAsync", "0"],
      float: ["GetDoubleValueAsync", "0.0"],
      json: ["GetObjectValueAsync", "new Value()"],
    }[t];
    return `var evalCtx = EvaluationContext.Builder()
    .SetTargetingKey("user-123")
    .Set("email", "contact@gofeatureflag.org")
    .Build();

var value = await client.${m[0]}("${name}", ${m[1]}, evalCtx);`;
  },

  python: (name, t) => {
    const m = {
      boolean: ["get_boolean_value", "False"],
      string: ["get_string_value", `"default"`],
      int: ["get_integer_value", "0"],
      float: ["get_float_value", "0.0"],
      json: ["get_object_value", "{}"],
    }[t];
    return `from openfeature.evaluation_context import EvaluationContext

eval_ctx = EvaluationContext(
    targeting_key="user-123",
    attributes={"email": "contact@gofeatureflag.org"},
)
value = client.${m[0]}("${name}", ${m[1]}, eval_ctx)`;
  },

  node: (name, t) => {
    const m = {
      boolean: ["getBooleanValue", "false"],
      string: ["getStringValue", `"default"`],
      int: ["getNumberValue", "0"],
      float: ["getNumberValue", "0"],
      json: ["getObjectValue", "{}"],
    }[t];
    return `const evalCtx = { targetingKey: "user-123", email: "contact@gofeatureflag.org" };

const value = await client.${m[0]}("${name}", ${m[1]}, evalCtx);`;
  },

  javascript: (name, t) => {
    const m = {
      boolean: ["getBooleanValue", "false"],
      string: ["getStringValue", `"default"`],
      int: ["getNumberValue", "0"],
      float: ["getNumberValue", "0"],
      json: ["getObjectValue", "{}"],
    }[t];
    // Web SDK is static-evaluation: context is set globally, then reads are sync.
    return `await OpenFeature.setContext({
  targetingKey: "user-123",
  email: "contact@gofeatureflag.org",
});

const value = client.${m[0]}("${name}", ${m[1]});`;
  },

  react: (name, t) => {
    const m = {
      boolean: ["useBooleanFlagValue", "false"],
      string: ["useStringFlagValue", `"default"`],
      int: ["useNumberFlagValue", "0"],
      float: ["useNumberFlagValue", "0"],
      json: ["useObjectFlagValue", "{}"],
    }[t];
    return `import { ${m[0]} } from "@openfeature/react-sdk";

function MyComponent() {
  const value = ${m[0]}("${name}", ${m[1]});
  return <span>{String(value)}</span>;
}`;
  },

  angular: (name, t) => {
    const m = {
      boolean: ["getBooleanDetails", "false"],
      string: ["getStringDetails", `"default"`],
      int: ["getNumberDetails", "0"],
      float: ["getNumberDetails", "0"],
      json: ["getObjectDetails", "{}"],
    }[t];
    return `import { Component, inject } from "@angular/core";
import { FeatureFlagService } from "@openfeature/angular-sdk";

@Component({
  selector: "app-flag",
  template: \`{{ (value$ | async)?.value }}\`,
})
export class FlagComponent {
  private flags = inject(FeatureFlagService);
  value$ = this.flags.${m[0]}("${name}", ${m[1]});
}`;
  },

  android: (name, t) => {
    const m = {
      boolean: ["getBooleanValue", "false"],
      string: ["getStringValue", `"default"`],
      int: ["getIntegerValue", "0"],
      float: ["getDoubleValue", "0.0"],
      json: ["getObjectValue", "Value.Structure(mapOf())"],
    }[t];
    // The evaluation context was set when the provider was registered above.
    return `val value = client.${m[0]}("${name}", ${m[1]})`;
  },

  swift: (name, t) => {
    const m = {
      boolean: ["getBooleanValue", "false"],
      string: ["getStringValue", `"default"`],
      int: ["getIntegerValue", "0"],
      float: ["getDoubleValue", "0.0"],
      json: ["getObjectValue", "Value.structure([:])"],
    }[t];
    // The evaluation context was set when the provider was registered above.
    return `let value = client.${m[0]}(key: "${name}", defaultValue: ${m[1]})`;
  },

  php: (name, t) => {
    const m = {
      boolean: ["getBooleanValue", "false"],
      string: ["getStringValue", `"default"`],
      int: ["getIntegerValue", "0"],
      float: ["getFloatValue", "0.0"],
      json: ["getObjectValue", "[]"],
    }[t];
    // PHP double-quoted strings interpolate `$var` — escape `$` so a name like
    // `$client` stays a literal.
    const safe = name.replace(/\$/g, "\\$");
    return `use OpenFeature\\implementation\\flags\\EvaluationContext;
use OpenFeature\\implementation\\flags\\Attributes;

$evalCtx = new EvaluationContext("user-123", new Attributes([
    "email" => "contact@gofeatureflag.org",
]));

$value = $client->${m[0]}("${safe}", ${m[1]}, $evalCtx);`;
  },

  ruby: (name, t) => {
    const m = {
      boolean: ["fetch_boolean_value", "false"],
      string: ["fetch_string_value", `"default"`],
      int: ["fetch_number_value", "0"],
      float: ["fetch_number_value", "0"],
      json: ["fetch_object_value", "{}"],
    }[t];
    // Ruby double-quoted strings interpolate `#{...}` — escape `#` so a name
    // like `item#{id}` stays a literal.
    const safe = name.replace(/#/g, "\\#");
    return `eval_ctx = OpenFeature::SDK::EvaluationContext.new(
  targeting_key: "user-123",
  "email" => "contact@gofeatureflag.org",
)
value = client.${m[0]}(
  flag_key: "${safe}",
  default_value: ${m[1]},
  evaluation_context: eval_ctx,
)`;
  },
};

// Every language embeds the flag name inside a double-quoted string literal, so
// escape the characters that would break it in ANY of them (backslash, double
// quote, and the common whitespace controls). Flag names aren't restricted to an
// identifier charset, so a name with a quote/backslash/newline must not produce a
// broken snippet. Language-specific hazards are handled in the relevant builders:
// `$` interpolation (PHP), `#{` interpolation (Ruby). The Go sample keeps the
// name out of the `fmt.Printf` format string so `%` needs no escaping.
function escapeFlagName(name: string): string {
  return name
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Build the full code sample for a flag: the provider-init snippet for the
 * language followed by a type-correct evaluation of the flag. Returns the same
 * shape as a flagset CodeSample so the tab can render it uniformly. The
 * `<your-api-key>` placeholder is left intact for the caller to substitute.
 */
export function buildFlagSample(
  langId: string,
  flagName: string,
  type: FlagType,
): CodeSample {
  const base = CODE_SAMPLES.find((s) => s.id === langId) ?? CODE_SAMPLES[0];
  const evaluation =
    EVALUATIONS[base.id]?.(escapeFlagName(flagName), evalType(type)) ?? "";
  return { ...base, code: `${base.code}\n\n${evaluation}` };
}

/** The languages offered, in display order (mirrors the flagset tab). */
export const FLAG_SAMPLE_LANGUAGES = CODE_SAMPLES.map(({ id, label }) => ({
  id,
  label,
}));
