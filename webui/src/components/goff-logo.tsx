import type { ComponentProps } from "react";
import goffLogo from "@/assets/gofeatureflag.svg";

export function GoffLogo(props: Omit<ComponentProps<"img">, "src">) {
  return <img src={goffLogo} alt="GO Feature Flag" {...props} />;
}

GoffLogo.displayName = "GoffLogo";
