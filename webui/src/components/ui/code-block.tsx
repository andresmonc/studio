import { memo, useEffect, useMemo, useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/components/theme/theme-provider";

// Register only the languages we actually render to keep the bundle lean (the
// full PrismLight language set is large): the code-sample tab languages plus
// json/yaml for the flag preview. Keeping the map as the single source means
// CODE_SAMPLES[].lang can be validated against it.
const LANGUAGES = {
  csharp,
  go,
  java,
  json,
  kotlin,
  php,
  python,
  ruby,
  swift,
  tsx,
  typescript,
  yaml,
} as const;

/** Prism language ids registered for highlighting (CODE_SAMPLES must use these). */
export const REGISTERED_LANGUAGES = Object.keys(LANGUAGES);

for (const [name, def] of Object.entries(LANGUAGES)) {
  SyntaxHighlighter.registerLanguage(name, def);
}

const CODE_TAG_PROPS = { style: { fontFamily: "var(--font-mono)" } } as const;

/** Resolve the effective light/dark mode, following the app theme provider. */
function useResolvedDark(): boolean {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (theme !== "system") {
      setIsDark(theme === "dark");
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [theme]);

  return isDark;
}

// Memoized: highlighting is comparatively expensive, so skip re-rendering when
// code/language/rounded are unchanged (e.g. when the parent re-renders for an
// unrelated reason such as opening the key picker).
export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  rounded = true,
}: {
  code: string;
  language: string;
  /** Whether to round the corners. Set false when wrapped in a framed container. */
  rounded?: boolean;
}) {
  const isDark = useResolvedDark();

  const customStyle = useMemo(
    () => ({
      margin: 0,
      padding: "0.75rem",
      borderRadius: rounded ? "0.375rem" : 0,
      fontSize: "0.875rem",
      fontFamily: "var(--font-mono)",
    }),
    [rounded],
  );

  return (
    <SyntaxHighlighter
      language={language}
      style={isDark ? oneDark : oneLight}
      customStyle={customStyle}
      codeTagProps={CODE_TAG_PROPS}
    >
      {code}
    </SyntaxHighlighter>
  );
});

CodeBlock.displayName = "CodeBlock";
