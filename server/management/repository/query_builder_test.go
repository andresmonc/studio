package repository

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestQueryBuilder_Empty(t *testing.T) {
	qb := NewQueryBuilder()
	where, args := qb.Build()
	assert.Equal(t, "", where)
	assert.Empty(t, args)
}

func TestQueryBuilder_Build(t *testing.T) {
	qb := NewQueryBuilder()
	qb.Add("a = $%d", 1)
	qb.Add("b = $%d", "x")
	where, args := qb.Build()
	assert.True(t, strings.HasPrefix(where, " AND "), where)
	assert.Contains(t, where, "a = $1")
	assert.Contains(t, where, "b = $2")
	assert.Equal(t, []any{1, "x"}, args)
}

// With an offset, placeholder numbering starts after the leading positional
// args already bound in the query (e.g. flag list binds flagset_id as $1, so
// the filter conditions must start at $2). Regression test for a bug where a
// name/disabled filter bound to the flagset id instead of the filter value.
func TestQueryBuilder_WithOffset(t *testing.T) {
	qb := NewQueryBuilderWithOffset(1)
	qb.Add("f.name ILIKE $%d", "%x%")
	qb.Add("f.disabled = $%d", true)
	where, args := qb.Build()
	assert.Contains(t, where, "f.name ILIKE $2")
	assert.Contains(t, where, "f.disabled = $3")
	assert.Equal(t, []any{"%x%", true}, args)
}

// A single bound argument can be referenced multiple times via an explicit
// index verb ($%[1]d). The audit-log tenant scope relies on this to bind one
// company id into both sides of an OR without duplicating the argument.
func TestQueryBuilder_SelfReferencingArg(t *testing.T) {
	qb := NewQueryBuilder()
	qb.Add("x = $%d", "first")
	qb.Add("(a = $%[1]d OR b IN (SELECT id FROM t WHERE c = $%[1]d))", "co-1")
	where, args := qb.Build()
	assert.Contains(t, where, "(a = $2 OR b IN (SELECT id FROM t WHERE c = $2))")
	assert.Equal(t, []any{"first", "co-1"}, args)
}
