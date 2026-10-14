package service

import (
	"errors"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not found")
	ErrConflict  = errors.New("conflict")

	errInvalidRole = model.ValidationError{Field: "role", Message: "invalid role"}
)

// publicError is a service error whose message is safe to show to the
// client. Handlers show only these messages, never err.Error(), so wrapped
// internals (SQL, constraint names) can't leak.
type publicError struct {
	kind  error // ErrNotFound, ErrConflict, ErrForbidden
	msg   string
	cause error // optional, for errors.Is
}

func (e *publicError) Error() string   { return e.kind.Error() + ": " + e.msg }
func (e *publicError) Unwrap() []error { return []error{e.kind, e.cause} }

func newPublicError(kind error, msg string) error { return &publicError{kind: kind, msg: msg} }

// PublicMessage returns the client-safe message carried by err, or "".
func PublicMessage(err error) string {
	var pe *publicError
	if errors.As(err, &pe) {
		return pe.msg
	}
	return ""
}

// nameTaken lists repository conflicts whose (static) message is safe to show.
var nameTaken = []error{repository.ErrTeamNameTaken, repository.ErrFlagsetNameTaken, repository.ErrFlagNameTaken}

// writeError maps repository errors of a write to service errors. A user who
// left the company between a check and the write (ErrConflictOrNotFound)
// reads as not found, like the check itself.
func writeError(err error) error {
	if errors.Is(err, repository.ErrNotFound) || errors.Is(err, repository.ErrConflictOrNotFound) {
		return ErrNotFound
	}
	for _, taken := range nameTaken {
		if errors.Is(err, taken) {
			return &publicError{kind: ErrConflict, msg: taken.Error(), cause: err}
		}
	}
	return err
}
