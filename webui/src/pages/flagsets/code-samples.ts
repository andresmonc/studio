// Code samples shown in the flagset "Code sample" tab.
//
// Each sample initializes the OpenFeature GO Feature Flag provider. The
// relay-proxy endpoint is hardcoded to the public GO Feature Flag URL — users
// swap it for their own instance. The literal `<your-api-key>` placeholder is
// replaced at render time with the API key the user selects (or left as-is
// when the flagset has no keys).
//
// Snippets are grounded in the official GO Feature Flag provider docs
// (https://gofeatureflag.org). Keep them in sync when provider APIs change.

export const SAMPLE_ENDPOINT = "https://api.gofeatureflag.io";
export const API_KEY_PLACEHOLDER = "<your-api-key>";

export type CodeSample = {
  /** Stable id used as the select/toggle value. */
  id: string;
  /** Human-readable label shown in the language picker. */
  label: string;
  /** Prism language id passed to the syntax highlighter (see REGISTERED_LANGUAGES). */
  lang: string;
  /** Snippet template containing the `<your-api-key>` placeholder. */
  code: string;
};

export const CODE_SAMPLES: CodeSample[] = [
  {
    id: "go",
    label: "Go",
    lang: "go",
    code: `import (
	"context"

	gofeatureflag "github.com/open-feature/go-sdk-contrib/providers/go-feature-flag/pkg"
	of "github.com/open-feature/go-sdk/openfeature"
)

ctx := context.Background()

provider, err := gofeatureflag.NewProviderWithContext(ctx, gofeatureflag.ProviderOptions{
	Endpoint: "${SAMPLE_ENDPOINT}",
	APIKey:   "${API_KEY_PLACEHOLDER}",
})
if err != nil {
	// handle the error
}
if err := of.SetProviderAndWait(provider); err != nil {
	// handle the error
}

client := of.NewClient("my-app")`,
  },
  {
    id: "java",
    label: "Java",
    lang: "java",
    code: `import dev.openfeature.contrib.providers.gofeatureflag.GoFeatureFlagProvider;
import dev.openfeature.contrib.providers.gofeatureflag.GoFeatureFlagProviderOptions;
import dev.openfeature.sdk.*;

GoFeatureFlagProvider provider = new GoFeatureFlagProvider(
    GoFeatureFlagProviderOptions.builder()
        .endpoint("${SAMPLE_ENDPOINT}")
        .apiKey("${API_KEY_PLACEHOLDER}")
        .build());

OpenFeatureAPI.getInstance().setProviderAndWait(provider);
Client client = OpenFeatureAPI.getInstance().getClient("my-app");`,
  },
  {
    id: "dotnet",
    label: ".NET",
    lang: "csharp",
    code: `using OpenFeature;
using OpenFeature.Contrib.Providers.GOFeatureFlag;

var options = new GoFeatureFlagProviderOptions
{
    Endpoint = "${SAMPLE_ENDPOINT}",
    ApiKey = "${API_KEY_PLACEHOLDER}",
};
var provider = new GoFeatureFlagProvider(options);

await Api.Instance.SetProviderAsync(provider);
var client = Api.Instance.GetClient("my-app");`,
  },
  {
    id: "python",
    label: "Python",
    lang: "python",
    code: `from gofeatureflag_python_provider.provider import GoFeatureFlagProvider
from gofeatureflag_python_provider.options import GoFeatureFlagOptions
from openfeature import api

provider = GoFeatureFlagProvider(
    options=GoFeatureFlagOptions(
        endpoint="${SAMPLE_ENDPOINT}",
        api_key="${API_KEY_PLACEHOLDER}",
    )
)
api.set_provider(provider)
client = api.get_client("my-app")`,
  },
  {
    id: "node",
    label: "Node.js",
    lang: "typescript",
    code: `import { OpenFeature } from "@openfeature/server-sdk";
import { GoFeatureFlagProvider } from "@openfeature/go-feature-flag-provider";

const provider = new GoFeatureFlagProvider({
  endpoint: "${SAMPLE_ENDPOINT}",
  apiKey: "${API_KEY_PLACEHOLDER}",
});

await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient("my-app");`,
  },
  {
    id: "javascript",
    label: "JavaScript (Web)",
    lang: "typescript",
    code: `import { OpenFeature } from "@openfeature/web-sdk";
import { GoFeatureFlagWebProvider } from "@openfeature/go-feature-flag-web-provider";

const provider = new GoFeatureFlagWebProvider({
  endpoint: "${SAMPLE_ENDPOINT}",
  apiKey: "${API_KEY_PLACEHOLDER}",
});

await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient();`,
  },
  {
    id: "react",
    label: "React",
    lang: "tsx",
    code: `import { OpenFeature, OpenFeatureProvider } from "@openfeature/react-sdk";
import { GoFeatureFlagWebProvider } from "@openfeature/go-feature-flag-web-provider";

const provider = new GoFeatureFlagWebProvider({
  endpoint: "${SAMPLE_ENDPOINT}",
  apiKey: "${API_KEY_PLACEHOLDER}",
});

OpenFeature.setProvider(provider);

function App() {
  return (
    <OpenFeatureProvider>
      {/* your app */}
    </OpenFeatureProvider>
  );
}`,
  },
  {
    id: "angular",
    label: "Angular",
    lang: "typescript",
    code: `import { OpenFeatureModule } from "@openfeature/angular-sdk";
import { GoFeatureFlagWebProvider } from "@openfeature/go-feature-flag-web-provider";

const provider = new GoFeatureFlagWebProvider({
  endpoint: "${SAMPLE_ENDPOINT}",
  apiKey: "${API_KEY_PLACEHOLDER}",
});

@NgModule({
  imports: [
    OpenFeatureModule.forRoot({ provider }),
  ],
})
export class AppModule {}`,
  },
  {
    id: "android",
    label: "Android (Kotlin)",
    lang: "kotlin",
    code: `import dev.openfeature.contrib.providers.gofeatureflag.*
import dev.openfeature.sdk.*

val provider = GoFeatureFlagProvider(
    GoFeatureFlagProviderOptions.builder()
        .endpoint("${SAMPLE_ENDPOINT}")
        .apiKey("${API_KEY_PLACEHOLDER}")
        .build()
)

val evaluationContext = ImmutableContext("user-123")
OpenFeatureAPI.setProviderAndWait(provider, evaluationContext)
val client = OpenFeatureAPI.getClient("my-app")`,
  },
  {
    id: "swift",
    label: "Swift (iOS)",
    lang: "swift",
    code: `import GOFeatureFlag
import OpenFeature

let options = GoFeatureFlagProviderOptions(
    endpoint: "${SAMPLE_ENDPOINT}",
    apiKey: "${API_KEY_PLACEHOLDER}"
)
let provider = GoFeatureFlagProvider(options: options)

let ctx = MutableContext(targetingKey: "user-123", structure: MutableStructure())
await OpenFeatureAPI.shared.setProviderAndWait(provider: provider, initialContext: ctx)
let client = OpenFeatureAPI.shared.getClient()`,
  },
  {
    id: "php",
    label: "PHP",
    lang: "php",
    code: `<?php
use OpenFeature\\OpenFeatureAPI;
use OpenFeature\\Providers\\GoFeatureFlag\\GoFeatureFlagProvider;
use OpenFeature\\Providers\\GoFeatureFlag\\config\\Config;

$provider = new GoFeatureFlagProvider(new Config(
    endpoint: "${SAMPLE_ENDPOINT}",
    apiKey: "${API_KEY_PLACEHOLDER}",
));

$api = OpenFeatureAPI::getInstance();
$api->setProvider($provider);
$client = $api->getClient("my-app");`,
  },
  {
    id: "ruby",
    label: "Ruby",
    lang: "ruby",
    code: `require "openfeature/go_feature_flag"

options = OpenFeature::GoFeatureFlag::Options.new(
  endpoint: "${SAMPLE_ENDPOINT}",
  api_key: "${API_KEY_PLACEHOLDER}"
)
provider = OpenFeature::GoFeatureFlag::Provider.new(options: options)

OpenFeature::SDK.configure do |config|
  config.set_provider(provider)
end
client = OpenFeature::SDK.build_client`,
  },
];
