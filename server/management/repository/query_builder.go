package repository

import (
	"fmt"
	"slices"
	"strings"
)

// QueryBuilder assembles AND-ed filter conditions with Postgres positional
// placeholders ($n) and collects their bound arguments.
type QueryBuilder struct {
	conditions []string
	args       []any
	// offset is the number of positional placeholders that already precede the
	// builder's conditions in the final query (e.g. a leading `WHERE id = $1`).
	// Placeholder numbering starts at offset+1 so the builder's args don't
	// collide with those pre-bound arguments.
	offset int
}

// NewQueryBuilder returns a builder whose first placeholder is $(offset+1).
// Pass the number of positional arguments the query binds before the
// builder's conditions, or 0 if there are none. It panics on a negative
// offset, which is always a programming error.
func NewQueryBuilder(offset int) *QueryBuilder {
	if offset < 0 {
		panic(fmt.Sprintf("repository: negative query builder offset %d", offset))
	}
	return &QueryBuilder{offset: offset}
}

// Add binds value and appends a condition. condFmt receives the placeholder
// index: use exactly one $%d (or repeat $%[1]d) and write a literal % as %%.
// condFmt must be a constant or a whitelisted column, never user input: only
// value is parameterized. Each condition is parenthesized so an OR inside it
// cannot escape the surrounding AND chain.
func (qb *QueryBuilder) Add(condFmt string, value any) {
	qb.conditions = append(qb.conditions, "("+fmt.Sprintf(condFmt, qb.bind(value))+")")
}

// Arg binds value without adding a condition and returns its placeholder
// (e.g. "$3"), for clauses outside the filter such as LIMIT and OFFSET.
func (qb *QueryBuilder) Arg(value any) string {
	return fmt.Sprintf("$%d", qb.bind(value))
}

// bind appends value and returns its placeholder index.
func (qb *QueryBuilder) bind(value any) int {
	qb.args = append(qb.args, value)
	return qb.offset + len(qb.args)
}

// Build returns the conditions as " AND (...) AND (...)", ready to append
// after an existing WHERE clause, or "" when there are none, plus a copy of
// the bound arguments in placeholder order.
func (qb *QueryBuilder) Build() (string, []any) {
	args := slices.Clone(qb.args)
	if len(qb.conditions) == 0 {
		return "", args
	}
	return " AND " + strings.Join(qb.conditions, " AND "), args
}
