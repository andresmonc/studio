package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const validID = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b"

var isUUIDCases = []struct {
	in   string
	want bool
}{
	{validID, true},
	{strings.ToUpper(validID), true},
	{"00000000-0000-0000-0000-000000000000", true},
	{"", false},
	{"not-a-uuid", false},
	{"{" + validID + "}", false},                  // Postgres accepts it; canonical only here
	{strings.ReplaceAll(validID, "-", ""), false}, // likewise
	{"urn:uuid:" + validID, false},                // uuid.Parse accepts it, Postgres doesn't
	{validID[:35] + "g", false},
}

func TestIsUUID(t *testing.T) {
	for _, tt := range isUUIDCases {
		t.Run(tt.in, func(t *testing.T) {
			assert.Equal(t, tt.want, IsUUID(tt.in))
		})
	}
}

// FuzzIsUUID: anything accepted is a canonical UUID, so Postgres can cast it.
func FuzzIsUUID(f *testing.F) {
	for _, tt := range isUUIDCases {
		f.Add(tt.in)
	}
	f.Fuzz(func(t *testing.T, s string) {
		if !IsUUID(s) {
			return
		}
		u, err := uuid.Parse(s)
		require.NoError(t, err)
		assert.Equal(t, strings.ToLower(s), u.String())
	})
}

func TestValidIDs(t *testing.T) {
	tests := []struct {
		name   string
		params echo.PathValues
		want   int
	}{
		{"no params", echo.PathValues{}, http.StatusOK},
		{"valid ids", echo.PathValues{{Name: "id", Value: validID}, {Name: "uid", Value: validID}}, http.StatusOK},
		{"malformed id", echo.PathValues{{Name: "id", Value: "x"}}, http.StatusNotFound},
		{"malformed uid", echo.PathValues{{Name: "uid", Value: "x"}}, http.StatusNotFound},
		{"malformed *Id", echo.PathValues{{Name: "teamId", Value: validID}, {Name: "keyId", Value: "x"}}, http.StatusNotFound},
		{"non-id param untouched", echo.PathValues{{Name: "n", Value: "abc"}}, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c := echo.New().NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec)
			c.SetPathValues(tt.params)
			err := ValidIDs()(func(c *echo.Context) error { return c.NoContent(http.StatusOK) })(c)
			require.NoError(t, err)
			assert.Equal(t, tt.want, rec.Code)
		})
	}
}
