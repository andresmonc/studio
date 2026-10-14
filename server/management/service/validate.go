package service

import (
	"fmt"
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
