-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE companies (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    display_name TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    email           CITEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL DEFAULT '',
    oidc_sub        TEXT UNIQUE,
    is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,
    -- No ON DELETE action: SET NULL would clear company_id but leave company_role,
    -- breaking the pair CHECK below. Deleting a company must first clear both
    -- fields on its members, in the same transaction.
    company_id      UUID REFERENCES companies(id),
    company_role    TEXT CHECK (company_role IN ('admin','member')),
    avatar_url      TEXT NOT NULL DEFAULT '',
    CONSTRAINT users_company_role_pair CHECK ((company_id IS NULL) = (company_role IS NULL))
);
CREATE INDEX idx_users_company ON users(company_id);

CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT teams_company_name_unique UNIQUE (company_id, name)
);

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
    polling_interval_ms           INTEGER CHECK (polling_interval_ms > 0),
    file_format                   TEXT CHECK (file_format IN ('yaml','json','toml')),
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
-- The partial index above can't serve the ON DELETE CASCADE from teams, which
-- also has to reach soft-deleted rows.
CREATE INDEX idx_flagsets_team ON flagsets(team_id);

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
CREATE INDEX idx_flags_flagset ON flags(flagset_id);

CREATE TABLE flag_versions (
    id             UUID PRIMARY KEY DEFAULT uuidv7(),
    flag_id        UUID NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    -- payload is `json` (not `jsonb`) deliberately: jsonb normalizes and reorders
    -- object keys, but flag payloads carry user-authored metadata whose insertion
    -- order is meaningful in the UI. `json` is text-faithful and preserves key order.
    payload        JSON NOT NULL,
    -- flag_type mirrors model.InferFlagType so the team flags list can filter on
    -- it in SQL. Variations are homogeneous (the type is enforced on write), so
    -- the first matching branch is the type. Paths are `strict`: in the default
    -- lax mode the filter unwraps arrays, so ["a"] would be typed "string".
    flag_type      TEXT GENERATED ALWAYS AS (CASE
        WHEN JSON_EXISTS(payload, 'strict $.variations.* ? (@.type() == "object" || @.type() == "array" || @.type() == "null")') THEN 'json'
        WHEN JSON_EXISTS(payload, 'strict $.variations.* ? (@.type() == "boolean")') THEN 'boolean'
        WHEN JSON_EXISTS(payload, 'strict $.variations.* ? (@.type() == "string")') THEN 'string'
        WHEN JSON_EXISTS(payload, 'strict $.variations.* ? (@.type() == "number" && @ != @.floor())') THEN 'float'
        WHEN JSON_EXISTS(payload, 'strict $.variations.* ? (@.type() == "number")') THEN 'int'
        ELSE 'unknown'
    END) VIRTUAL,
    comment       TEXT NOT NULL DEFAULT '',
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (flag_id, version_number),
    -- Target of fk_flags_current_version, so a flag can only point at its own versions.
    UNIQUE (id, flag_id)
);
CREATE INDEX idx_flag_versions_created_by ON flag_versions(created_by);

ALTER TABLE flags
    ADD CONSTRAINT fk_flags_current_version
    FOREIGN KEY (current_version_id, id) REFERENCES flag_versions(id, flag_id)
    ON DELETE SET NULL (current_version_id);

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
    api_key     TEXT NOT NULL UNIQUE,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_flagset_api_keys_flagset ON flagset_api_keys(flagset_id);
CREATE INDEX idx_flagset_api_keys_created_by ON flagset_api_keys(created_by);

-- audit_log has no foreign keys on purpose: it is append-only history, and an
-- ON DELETE action would rewrite (or block) the entry recording the delete.
-- actor_email is a snapshot so the actor stays readable after the user is gone.
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id   UUID,
    actor_email     TEXT,
    team_id         UUID,
    flagset_id      UUID,
    flag_id         UUID,
    action          TEXT NOT NULL CHECK (action IN ('create','update','delete','rollback')),
    target_type     TEXT NOT NULL CHECK (target_type IN (
        'company','company_member','team','team_member','flagset','api_key','flag'
    )),
    target_id       TEXT NOT NULL,
    before          JSONB,
    after           JSONB,
    metadata        JSONB,
    company_id      UUID
);
CREATE INDEX idx_audit_log_occurred_desc       ON audit_log(occurred_at DESC);
CREATE INDEX idx_audit_log_company_occurred    ON audit_log(company_id, occurred_at DESC);
CREATE INDEX idx_audit_log_team_occurred       ON audit_log(team_id, occurred_at DESC);
CREATE INDEX idx_audit_log_flagset             ON audit_log(flagset_id);
CREATE INDEX idx_audit_log_flag                ON audit_log(flag_id);
CREATE INDEX idx_audit_log_actor               ON audit_log(actor_user_id);

-- goff_flags exposes live flags in the shape expected by GO Feature Flag's
-- postgresql retriever (flag_name, flagset, config). The flagset key is the
-- flagset UUID because flagset names are only unique per team; it stays a uuid
-- (not text) so the retriever's `WHERE flagset = $1` can use idx_flags_flagset. `disabled` lives
-- outside the payload, so it is merged in as GOFF's `disable` field; the jsonb
-- cast reorders keys, which GOFF does not care about.
CREATE VIEW goff_flags AS
SELECT f.name             AS flag_name,
       f.flagset_id       AS flagset,
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
