-- +goose Up
-- Session tokens carry the version they were issued with; bumping it revokes
-- every live session of the user (logout).
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE users DROP COLUMN session_version;
