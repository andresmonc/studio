-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE companies (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    display_name TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    domain       CITEXT
);
CREATE UNIQUE INDEX companies_domain_unique ON companies(domain) WHERE domain IS NOT NULL;

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    email           CITEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL DEFAULT '',
    oidc_sub        TEXT UNIQUE,
    is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    company_role    TEXT CHECK (company_role IN ('admin','member')),
    avatar_url      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_users_company ON users(company_id);

CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT teams_company_name_unique UNIQUE (company_id, name)
);
CREATE INDEX idx_teams_company ON teams(company_id);

CREATE TABLE team_members (
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members(user_id);

CREATE TABLE flagsets (
    id                            UUID PRIMARY KEY DEFAULT uuidv7(),
    team_id                       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name                          TEXT NOT NULL,
    description                   TEXT NOT NULL DEFAULT '',
    polling_interval_ms           INTEGER,
    file_format                   TEXT,
    retrievers                    JSONB,
    exporters                     JSONB,
    notifiers                     JSONB,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluation_context_enrichment JSONB,
    default_testing_evaluation_context JSONB,
    deleted_at                    TIMESTAMPTZ
);
-- Flagsets are soft-deleted (along with their flags), so uniqueness only applies
-- to live flagsets; a deleted flagset's name can be reused.
CREATE UNIQUE INDEX flagsets_team_name_live_unique ON flagsets(team_id, name) WHERE deleted_at IS NULL;

CREATE TABLE flags (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    flagset_id         UUID NOT NULL REFERENCES flagsets(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    current_version_id UUID,
    disabled           BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Flags are soft-deleted, so uniqueness only applies to live flags; a deleted
-- flag's name can be reused.
CREATE UNIQUE INDEX flags_flagset_name_live_unique ON flags(flagset_id, name) WHERE deleted_at IS NULL;

CREATE TABLE flag_versions (
    id             UUID PRIMARY KEY DEFAULT uuidv7(),
    flag_id        UUID NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    -- payload is `json` (not `jsonb`) deliberately: jsonb normalizes and reorders
    -- object keys, but flag payloads carry user-authored metadata whose insertion
    -- order is meaningful in the UI. `json` is text-faithful and preserves key order.
    payload        JSON NOT NULL,
    -- flag_type mirrors model.InferFlagType so the team flags list can filter on
    -- it in SQL. Variations are homogeneous (the type is enforced on write), so
    -- the first matching branch is the type.
    flag_type      TEXT GENERATED ALWAYS AS (CASE
        WHEN JSON_EXISTS(payload, '$.variations.* ? (@.type() == "object" || @.type() == "array" || @.type() == "null")') THEN 'json'
        WHEN JSON_EXISTS(payload, '$.variations.* ? (@.type() == "boolean")') THEN 'boolean'
        WHEN JSON_EXISTS(payload, '$.variations.* ? (@.type() == "string")') THEN 'string'
        WHEN JSON_EXISTS(payload, '$.variations.* ? (@.type() == "number" && @ != @.floor())') THEN 'float'
        WHEN JSON_EXISTS(payload, '$.variations.* ? (@.type() == "number")') THEN 'int'
        ELSE 'unknown'
    END) VIRTUAL,
    comment       TEXT NOT NULL DEFAULT '',
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (flag_id, version_number)
);
CREATE INDEX idx_flag_versions_flag_desc ON flag_versions(flag_id, version_number DESC);

ALTER TABLE flags
    ADD CONSTRAINT fk_flags_current_version
    FOREIGN KEY (current_version_id) REFERENCES flag_versions(id) ON DELETE SET NULL;

-- flag_tags is a normalized, derived index of each flag's current-version tags
-- (mirrored from payload.metadata.tags). The payload metadata remains the source
-- of truth; this table exists to answer "all tags in a team" cheaply and to seed
-- future server-side tag filtering. Rows are replaced on every flag create/update
-- inside the same transaction that writes the new version.
CREATE TABLE flag_tags (
    flag_id UUID NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (flag_id, tag)
);
CREATE INDEX idx_flag_tags_tag ON flag_tags(tag);

CREATE TABLE flagset_api_keys (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    flagset_id  UUID NOT NULL REFERENCES flagsets(id) ON DELETE CASCADE,
    label       TEXT NOT NULL DEFAULT '',
    api_key     TEXT NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_flagset_api_keys_flagset ON flagset_api_keys(flagset_id);

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id   UUID REFERENCES users(id),
    team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
    flagset_id      UUID REFERENCES flagsets(id) ON DELETE SET NULL,
    flag_id         UUID REFERENCES flags(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    target_type     TEXT NOT NULL,
    target_id       TEXT NOT NULL,
    before          JSONB,
    after           JSONB,
    metadata        JSONB,
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX idx_audit_log_occurred_desc       ON audit_log(occurred_at DESC);
CREATE INDEX idx_audit_log_company_occurred    ON audit_log(company_id, occurred_at DESC);
CREATE INDEX idx_audit_log_team_occurred       ON audit_log(team_id, occurred_at DESC);
CREATE INDEX idx_audit_log_flagset             ON audit_log(flagset_id);
CREATE INDEX idx_audit_log_flag                ON audit_log(flag_id);
CREATE INDEX idx_audit_log_actor               ON audit_log(actor_user_id);

-- goff_flags exposes live flags in the shape expected by GO Feature Flag's
-- postgresql retriever (flag_name, flagset, config). The flagset key is the
-- flagset UUID because flagset names are only unique per team. `disabled` lives
-- outside the payload, so it is merged in as GOFF's `disable` field; the jsonb
-- cast reorders keys, which GOFF does not care about.
CREATE VIEW goff_flags AS
SELECT f.name             AS flag_name,
       f.flagset_id::text AS flagset,
       fv.payload::jsonb || jsonb_build_object('disable', f.disabled) AS config
FROM flags f
JOIN flagsets fs ON fs.id = f.flagset_id
JOIN flag_versions fv ON fv.id = f.current_version_id
WHERE f.deleted_at IS NULL AND fs.deleted_at IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP VIEW IF EXISTS goff_flags;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS flagset_api_keys;
DROP TABLE IF EXISTS flag_tags;
ALTER TABLE IF EXISTS flags DROP CONSTRAINT IF EXISTS fk_flags_current_version;
DROP TABLE IF EXISTS flag_versions;
DROP TABLE IF EXISTS flags;
DROP TABLE IF EXISTS flagsets;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;
-- +goose StatementEnd
