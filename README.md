# GO Feature Flag Studio

![Status: Work in progress](https://img.shields.io/badge/status-work%20in%20progress-orange)

> 🚧 **We are currently building this.** The Studio is under active development:
> features, APIs and the data model can change at any time, and it is not ready
> for production use yet. Feedback and contributions are welcome!

## What is it?

GO Feature Flag Studio is the web interface for
[GO Feature Flag](https://gofeatureflag.org), the open-source feature flag
solution built on [OpenFeature](https://openfeature.dev).

GO Feature Flag already lets you evaluate flags from a file through the relay
proxy and the OpenFeature SDKs. The Studio adds the place where humans manage
those flags: create and edit them in a UI, organize them by team, control who
can change what, and keep a history of every change.

## Run the Studio locally

### Prerequisites

- Docker + Docker Compose
- Go 1.26+
- Node 20 + [pnpm](https://pnpm.io)
- [goose](https://github.com/pressly/goose): `go install github.com/pressly/goose/v3/cmd/goose@latest`
- `make`
- This line in `/etc/hosts` (the API and UI share a cookie domain):
  ```
  127.0.0.1 goff.local
  ```

### Start

```bash
# Terminal 1 — Postgres, Keycloak, migrations, seed data, then the API on :8080
cd server && make start-api-dev

# Terminal 2 — the web UI on :5173
cd webui && pnpm install && pnpm dev
```

Open **http://goff.local:5173** (not `localhost`) and log in with
`admin@local` / `admin`.

Stop everything (wipes the local database) with `cd server && make stop-api`.

More details in [docs/how-to/run-the-stack.md](docs/how-to/run-the-stack.md).

## License

MIT
