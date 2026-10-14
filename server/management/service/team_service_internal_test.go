package service

import (
	"errors"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/stretchr/testify/assert"
)

func TestTeamWriteError(t *testing.T) {
	other := errors.New("boom")
	tests := []struct {
		name string
		in   error
		want error
	}{
		{"not found", repository.ErrNotFound, ErrNotFound},
		{"admin left the company", repository.ErrConflictOrNotFound, ErrNotFound},
		{"name taken", repository.ErrTeamNameTaken, ErrConflict},
		{"other errors pass through", other, other},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.ErrorIs(t, teamWriteError(tt.in), tt.want)
		})
	}
}
