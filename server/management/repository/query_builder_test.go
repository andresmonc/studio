package repository

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestQueryBuilder(t *testing.T) {
	type add struct {
		cond  string
		value any
	}
	tests := []struct {
		name      string
		offset    int
		adds      []add
		wantWhere string
		wantArgs  []any
	}{
		{
			name:      "empty",
			wantWhere: "",
		},
		{
			name:      "conditions joined with AND",
			adds:      []add{{"a = $%d", 1}, {"b = $%d", "x"}},
			wantWhere: " AND (a = $1) AND (b = $2)",
			wantArgs:  []any{1, "x"},
		},
		{
			// Placeholders start after args already bound before the builder's conditions.
			name:      "offset",
			offset:    1,
			adds:      []add{{"f.name ILIKE $%d", "%x%"}, {"f.disabled = $%d", true}},
			wantWhere: " AND (f.name ILIKE $2) AND (f.disabled = $3)",
			wantArgs:  []any{"%x%", true},
		},
		{
			name:      "self-referencing arg",
			adds:      []add{{"x = $%d", "first"}, {"a = $%[1]d OR b IN (SELECT id FROM t WHERE c = $%[1]d)", "co-1"}},
			wantWhere: " AND (x = $1) AND (a = $2 OR b IN (SELECT id FROM t WHERE c = $2))",
			wantArgs:  []any{"first", "co-1"},
		},
		{
			// An OR must not escape a leading scope like `WHERE flagset_id = $1`.
			name:      "OR is parenthesized",
			offset:    1,
			adds:      []add{{"a = $%d OR b = $%[1]d", "v"}},
			wantWhere: " AND (a = $2 OR b = $2)",
			wantArgs:  []any{"v"},
		},
		{
			name:      "literal percent",
			adds:      []add{{"name LIKE 'a%%' AND id = $%d", 7}},
			wantWhere: " AND (name LIKE 'a%' AND id = $1)",
			wantArgs:  []any{7},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			qb := NewQueryBuilderWithOffset(tt.offset)
			for _, a := range tt.adds {
				qb.Add(a.cond, a.value)
			}
			where, args := qb.Build()
			assert.Equal(t, tt.wantWhere, where)
			assert.Equal(t, tt.wantArgs, args)
		})
	}
}
