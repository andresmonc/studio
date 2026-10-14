package service

import (
	"errors"
	"fmt"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not found")
	ErrConflict  = errors.New("conflict")

	errInvalidRole = model.ValidationError{Field: "role", Message: "invalid role"}
)

// writeError maps repository errors of a write to service errors. A user who
// left the company between a check and the write (ErrConflictOrNotFound)
// reads as not found, like the check itself.
func writeError(err error) error {
	switch {
	case errors.Is(err, repository.ErrNotFound), errors.Is(err, repository.ErrConflictOrNotFound):
		return ErrNotFound
	case errors.Is(err, repository.ErrTeamNameTaken):
		return fmt.Errorf("%w: %w", ErrConflict, err)
	}
	return err
}
