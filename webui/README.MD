# GOFF-webui

<div align="center" style="margin: 30px;">
    <a href="https://refine.dev">
    <img alt="refine logo" src="https://refine.ams3.cdn.digitaloceanspaces.com/readme/refine-readme-banner.png">
    </a>
</div>
<br/>

The web UI for the **GO Feature Flag Management System** — a
[Refine](https://github.com/refinedev/refine) single-page app (Vite, React 19,
TypeScript, shadcn/ui, Tailwind) for authoring flags, managing teams, and testing
evaluations. It talks only to the Go management API over REST.

## Getting Started

This app expects the management API running on `http://goff.local:8080`. The
quickest path is to boot the whole stack — see
[docs/how-to/run-the-stack.md](../docs/how-to/run-the-stack.md) — then run the
webui dev server below and open **http://goff.local:5173**.

How the app is wired (Refine providers, data/auth/access-control, the flag editor
and Evaluate/Code-Sample tabs) is documented in the project
[`docs/`](../docs/README.md) tree, starting with
[Architecture](../docs/explanation/architecture.md).

## Available Scripts

### Running the development server.

```bash
    pnpm dev
```

### Building for production.

```bash
    pnpm build
```

### Running the production server.

```bash
    pnpm start
```

## Changelog

[`CHANGELOG.md`](./CHANGELOG.md) is **auto-generated** from conventional commits with
[git-cliff](https://git-cliff.org) — **do not edit it by hand**. Entries come from your
commit / squash-merge PR title: `feat(scope): …` → Added, `fix(scope): …` → Fixed,
`fix(security): …` → Security, `refactor` → Changed, `perf` → Performance; `chore` / `test`
/ `ci` / `build` / `style` / `docs` are hidden. Only commits touching `webui/**` are
included (the server has its own changelog), and there are no version tags yet, so
everything lands under **Unreleased**.

It is regenerated and committed automatically on every push to `main` by
`.github/workflows/changelog.yml`. To preview locally (requires
[`git-cliff`](https://git-cliff.org)):

```bash
    pnpm changelog
```

## Learn More

To learn more about **Refine**, please check out the [Documentation](https://refine.dev/docs)

- **REST Data Provider** [Docs](https://refine.dev/docs/core/providers/data-provider/#overview)
- **shadcn/ui** [Docs](https://refine.dev/docs/guides-concepts/general-concepts/#headless-concept)
- **React Router** [Docs](https://refine.dev/docs/core/providers/router-provider/)

## License

MIT
