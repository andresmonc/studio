package service

import (
	"errors"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
)

func TestWriteError(t *testing.T) {
	other := errors.New("boom")
	tests := []struct {
		name string
		in   error
		want error
	}{
		{"not found", repository.ErrNotFound, ErrNotFound},
		{"user left the company", repository.ErrConflictOrNotFound, ErrNotFound},
		{"name taken", repository.ErrTeamNameTaken, ErrConflict},
		{"other errors pass through", other, other},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.ErrorIs(t, writeError(tt.in), tt.want)
		})
	}
	taken := writeError(repository.ErrFlagNameTaken)
	assert.ErrorIs(t, taken, repository.ErrFlagNameTaken, "the cause stays matchable")
	assert.Equal(t, repository.ErrFlagNameTaken.Error(), PublicMessage(taken))
	assert.Equal(t, "conflict: "+repository.ErrFlagNameTaken.Error(), taken.Error())
	assert.Empty(t, PublicMessage(other))
}

func FuzzValidateName(f *testing.F) {
	for _, seed := range []string{"Platform", " Core ", "", "   ", strings.Repeat("é", 120), strings.Repeat("x", 121)} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, in string) {
		name := in
		errs := validateName(&name, "name")
		assert.Equal(t, strings.TrimSpace(in), name, "trimmed in place")
		valid := name != "" && utf8.RuneCountInString(name) <= maxNameLength
		if valid {
			assert.Nil(t, errs)
			return
		}
		if assert.Len(t, errs, 1) {
			assert.Equal(t, "name", errs[0].Field)
		}
	})
}
