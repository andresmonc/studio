package service_test

import (
	"context"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// auditCount returns the number of audit_log rows with the given action and
// target type.
func auditCount(t *testing.T, db *repository.DB, action model.AuditAction, target model.AuditTargetType) int {
	t.Helper()
	var n int
	err := db.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM audit_log WHERE action = $1 AND target_type = $2`, action, target).Scan(&n)
	require.NoError(t, err)
	return n
}

// validationFields returns the fields named by a model.ValidationErrors error.
func validationFields(t *testing.T, err error) []string {
	t.Helper()
	var ve model.ValidationErrors
	require.ErrorAs(t, err, &ve)
	fields := make([]string, len(ve))
	for i, e := range ve {
		fields[i] = e.Field
	}
	return fields
}

// assertLastAudit checks the before/after payloads of the newest audit entry
// about the given target ("" means NULL).
func assertLastAudit(
	t *testing.T, db *repository.DB, target model.AuditTargetType, targetID, before, after string,
) {
	t.Helper()
	var gotBefore, gotAfter []byte
	require.NoError(t, db.Pool.QueryRow(context.Background(), `SELECT before, after FROM audit_log
		WHERE target_type = $1 AND target_id = $2 ORDER BY id DESC LIMIT 1`, target, targetID).Scan(&gotBefore, &gotAfter))
	for _, c := range []struct{ want, got string }{{before, string(gotBefore)}, {after, string(gotAfter)}} {
		if c.want == "" {
			assert.Empty(t, c.got)
		} else {
			assert.JSONEq(t, c.want, c.got)
		}
	}
}
