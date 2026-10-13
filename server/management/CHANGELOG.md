# Changelog

All notable changes to this component are documented here.

This file is **auto-generated** from [conventional commits](https://www.conventionalcommits.org)
with [git-cliff](https://git-cliff.org) — **do not edit it by hand**. Entries come from
commit messages of the form `type(scope): subject`; regenerate with `git cliff` (see the
component's CONTRIBUTING / package scripts). The project is pre-1.0 and untagged, so all
changes currently live under *Unreleased*.

## [Unreleased]

### Added

- **server**: Add OpenTelemetry tracing and metrics (#87) (`5d71e8e`)
- **webui**: Redirect / to the flags page (#84) (`50e0c8a`)
- **flagsets**: Soft-delete flagsets and their flags, show flag count in delete dialog (#79) (`d82711d`)
- **flags**: Paginate, filter and sort the team flags list server-side (#77) (`1153289`)
- **db**: Use UUIDv7 primary keys on Postgres 18 (#76) (`26eac3a`)
- Mono company mode (default) with first-login setup (#72) (`1618ebf`)
- **management**: Add goff_flags view for the GOFF postgresql retriever (#70) (`b108df4`)
- Add tags to feature flags (#60) (`424c845`)
- Show progressive rollouts in the flags list distribution column (#59) (`61254c3`)
- Redesign all flags list with distribution and targeting columns (#56) (`a6b07cd`)
- **conductor**: Auto-start full dev stack per workspace (#45) (`f28d465`)
- **flagsets**: Auto-create a default API key when a flagset is created (#35) (`068cd12`)
- **flags**: Add an Evaluate tab and flagset default testing context (#32) (`783e49f`)
- **flags**: Add flag test-evaluation endpoint (#14) (`0f16c10`)
- **flags**: Auto-manage metadata.flagType for OpenFeature CLI (`9cebaa6`)
- **server**: Allow flag editors to delete a flag (`92470a8`)
- **server**: Enforce flag type immutability on update (`83a833a`)

### Changed

- **management**: Migrate server to echo v5 (#69) (`4b01e78`)
- **management**: Squash db migrations into 0001_init (#67) (`9983e25`)
- **server**: Apply ponytail audit cleanups to the management API (#64) (`e8dd2a3`)

### Fixed

- **api**: Align management API with REST best practices (#75) (`e682f58`)
- **management**: Fix schema-level bugs found in DB audit (#65) (`580751d`)
- **flagsets**: Show real flag and enabled counts on flagset cards (#37) (`c9b459e`)
- **server**: Cap request body size with BodyLimit middleware (#28) (`ac80268`)
- **server**: Preserve flag payload key order on save (`6e6c0bc`)

### Security

- **security**: Scope audit log to caller's tenant (#18) (`854292a`)
- **security**: Verify API key ownership before deletion (#19) (`6a16d3c`)


