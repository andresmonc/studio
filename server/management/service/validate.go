package service

import (
	"strings"
	"unicode/utf8"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
)

// validateName trims a team/flagset name in place and rejects it when empty or
// longer than 120 characters, so create and update enforce the same rules.
func validateName(name *string) error {
	*name = strings.TrimSpace(*name)
	if *name == "" {
		return model.ValidationErrors{{Field: "name", Message: "name is required"}}
	}
	if utf8.RuneCountInString(*name) > 120 {
		return model.ValidationErrors{{Field: "name", Message: "max 120 characters"}}
	}
	return nil
}
