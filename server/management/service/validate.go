package service

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"unicode/utf8"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
)

// validateName trims a team, flagset or company name in place and rejects it
// when empty or longer than 120 characters, so create and update enforce the
// same rules. field names the request field in the error.
func validateName(name *string, field string) model.ValidationErrors {
	*name = strings.TrimSpace(*name)
	if *name == "" {
		return model.ValidationErrors{{Field: field, Message: field + " is required"}}
	}
	if utf8.RuneCountInString(*name) > maxNameLength {
		msg := fmt.Sprintf("%s must be at most %d characters", field, maxNameLength)
		return model.ValidationErrors{{Field: field, Message: msg}}
	}
	return nil
}

const maxNameLength = 120

// changes reports whether an optional PATCH field (nil: absent) differs from
// the current value. Unchanged updates skip the write and the audit entry.
func changes(field *string, current string) bool { return field != nil && *field != current }

// jsonChanges is changes for a JSON setting (empty: absent; null: clear). It
// compares values, not bytes: the column is jsonb, which normalizes formatting
// and key order. field has been validated as JSON already.
func jsonChanges(field, current json.RawMessage) bool {
	if len(field) == 0 {
		return false
	}
	var a, b any
	_ = json.Unmarshal(field, &a)
	if len(current) > 0 {
		_ = json.Unmarshal(current, &b)
	}
	return !reflect.DeepEqual(a, b)
}
