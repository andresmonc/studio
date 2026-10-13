package repository

import (
	"fmt"
	"strings"
)

type QueryBuilder struct {
	conditions []string
	args       []any
	// offset is the number of positional placeholders that already precede the
	// builder's conditions in the final query (e.g. a leading `WHERE id = $1`).
	// Placeholder numbering starts at offset+1 so the builder's args don't
	// collide with those pre-bound arguments.
	offset int
}

func NewQueryBuilder() *QueryBuilder {
	return &QueryBuilder{}
}

// NewQueryBuilderWithOffset returns a builder whose first placeholder is
// $(offset+1). Use it when the query already binds `offset` positional
// arguments before the builder's conditions.
func NewQueryBuilderWithOffset(offset int) *QueryBuilder {
	return &QueryBuilder{offset: offset}
}

func (qb *QueryBuilder) Add(condFmt string, value any) {
	qb.args = append(qb.args, value)
	qb.conditions = append(qb.conditions, fmt.Sprintf(condFmt, qb.offset+len(qb.args)))
}

func (qb *QueryBuilder) Build() (string, []any) {
	if len(qb.conditions) == 0 {
		return "", qb.args
	}
	return " AND " + strings.Join(qb.conditions, " AND "), qb.args
}
