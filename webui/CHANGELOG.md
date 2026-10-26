# Changelog

All notable changes to this component are documented here.

This file is **auto-generated** from [conventional commits](https://www.conventionalcommits.org)
with [git-cliff](https://git-cliff.org) — **do not edit it by hand**. Entries come from
commit messages of the form `type(scope): subject`; regenerate with `git cliff` (see the
component's CONTRIBUTING / package scripts). The project is pre-1.0 and untagged, so all
changes currently live under *Unreleased*.

## [Unreleased]

### Added

- **webui**: Use GOFF logo as favicon (#86) (`8fe3032`)
- **webui**: Redirect / to the flags page (#84) (`50e0c8a`)
- **webui**: Move Flags link under General in flagset page nav (#83) (`129992f`)
- **webui**: Put Flags first in the Workspace sidebar menu (#82) (`4e07e56`)
- **webui**: Add Flags link from flagset page to filtered flag list (#81) (`bc7348e`)
- **webui**: Require typing the flagset name to confirm deletion (#80) (`b0aab4b`)
- **flagsets**: Soft-delete flagsets and their flags, show flag count in delete dialog (#79) (`d82711d`)
- **webui**: Move flagset danger zone into the Settings tab (#78) (`0675030`)
- **flags**: Paginate, filter and sort the team flags list server-side (#77) (`1153289`)
- Mono company mode (default) with first-login setup (#72) (`1618ebf`)
- **webui**: Rename browser tab title to GO Feature Flag Studio (#68) (`89976c2`)
- **webui**: Add GOFF logo to the login card (#66) (`9b21d4b`)
- **webui**: Move flag list tags to their own line under the flag (#63) (`57826a4`)
- **webui**: Make the flag tag editor searchable via cmdk Command (#61) (`757df24`)
- Add tags to feature flags (#60) (`424c845`)
- Show progressive rollouts in the flags list distribution column (#59) (`61254c3`)
- **webui**: Remove separators between sidebar sections (#57) (`ed50f7d`)
- Redesign all flags list with distribution and targeting columns (#56) (`a6b07cd`)
- **webui**: Add Storybook component library for ui primitives (#50) (`be8f5bc`)
- **webui**: Add "Recently edited" flags section to sidebar (#55) (`47b87ce`)
- **webui**: Name non-boolean flag variations control/treatment-N (#49) (`92185e8`)
- **webui**: Error state on progressive rollout variation selects (#48) (`6df6344`)
- **webui**: Add team-scoped audit log page under Workspace (#46) (`e031b88`)
- **webui**: Show both variation percentages in the progressive rollout curve (#44) (`dcf98dc`)
- **webui**: Group flags and flagsets under a Workspace sidebar section (#43) (`25287fd`)
- **flags**: Show real GOFF format in flag review preview (#36) (`2208d80`)
- **flags**: Add an Evaluate tab and flagset default testing context (#32) (`783e49f`)
- **flags**: Add Code sample tab with OpenFeature evaluation snippets (#30) (`5f8af36`)
- **flags**: Distinguish targeting rules from the default rule in the editor (#31) (`b171a2c`)
- **flagsets**: Add Code sample tab with OpenFeature snippets (#29) (`e572862`)
- **flags**: Use left-menu navigation on the flag detail page (#27) (`2c3eac9`)
- **flags**: Cap percentage rollout sliders at the remaining capacity (#25) (`a70c1b0`)
- **flags**: Default progressive rollout times to 12:00 AM (#24) (`315e5b4`)
- **flags**: Explain decimal percentages with a tip in the rollout editor (#22) (`fb08af1`)
- **flags**: Use a slider for percentage rollout weights (#16) (`8c47379`)
- **flags**: Progressive rollout editor with rollout curve & serving-now recap (#15) (`f65c243`)
- **webui**: Add targeting tips and rule-count badge to flag detail (#12) (`84de441`)
- **flags**: Name boolean variations enabled/disabled and lock them (#13) (`1973f00`)
- **flags**: Auto-manage metadata.flagType for OpenFeature CLI (`9cebaa6`)
- **webui**: Add trackEvents toggle and reorder flag detail tabs (`98e411c`)
- **webui**: Preset flag list filters from URL query params (`47b66ab`)
- **webui**: Metadata editor tab on flag detail page (`6fac3fb`)
- **webui**: Delete-flag danger zone with type-to-confirm modal (`ea563cc`)
- **webui**: Add flag metadata tab with typed properties (`e784e57`)
- **webui**: Make flag list rows clickable (`4252363`)
- **webui**: Revamp flag detail page actions and metadata (`3a0b834`)
- **webui**: Add flag detail page with versions, inline edit, and revert (`4b2e148`)
- **webui**: Extract reusable flag form components (`b361407`)
- **webui**: Add targeting attributes catalog and custom field selector (`ca57447`)
- **webui**: Extend api types for flag payload, versions, and pagination (`1d48f68`)

### Changed

- **webui**: Move flag tags editor from Metadata to Settings section (#62) (`c624180`)
- **webui**: Split large components into smaller colocated files (#34) (`0a32dfc`)
- **webui**: Use shared flag-form components in the wizard (`2109b65`)

### Fixed

- **api**: Align management API with REST best practices (#75) (`e682f58`)
- **webui**: Refresh "Recently edited" sidebar after flag mutations (#58) (`df437d6`)
- **webui**: Hide percentage Tips callout in flag creation wizard (#53) (`c9d7464`)
- **flags**: Hide the live badge when a flag is disabled (#41) (`9aff17e`)
- **flagsets**: Show real flag and enabled counts on flagset cards (#37) (`c9b459e`)
- **webui**: Drop deprecated baseUrl from tsconfig (#23) (`4c482b1`)
- **webui**: Remove dead code and complete detail test mock (`fd84002`)
- **ci**: Pin pnpm version and repair sidebar test mocks (`d98020b`)

### Security

- **security**: Add CSP and security headers to the served SPA (#21) (`39a75d5`)
- **security**: Keep Refine devtools out of production builds (#20) (`b8cce3b`)


