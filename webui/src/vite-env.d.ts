/// <reference types="vite/client" />

// Ships with react-syntax-highlighter but is missing from its index and @types.
declare module "react-syntax-highlighter/dist/esm/styles/prism/a11y-one-light" {
  const style: Record<string, React.CSSProperties>;
  export default style;
}
