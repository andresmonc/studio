package model

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewPaginatedResponse(t *testing.T) {
	tests := []struct {
		name           string
		total          int
		page           int
		pageSize       int
		wantTotalPages int
		wantPage       int
		wantPageSize   int
	}{
		{"exact multiple", 20, 1, 10, 2, 1, 10},
		{"with remainder rounds up", 21, 1, 10, 3, 1, 10},
		{"single page", 5, 1, 10, 1, 1, 10},
		{"zero total", 0, 1, 10, 0, 1, 10},
		{"zero page size defaults to 50", 10, 1, 0, 1, 1, 50},
		{"oversized page size caps at 200", 450, 1, 999, 3, 1, 200},
		{"page below 1 clamps to 1", 10, 0, 10, 1, 1, 10},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := NewPaginatedResponse([]string{"a"}, tt.total, tt.page, tt.pageSize)
			assert.Equal(t, tt.wantTotalPages, resp.TotalPages)
			assert.Equal(t, tt.total, resp.Total)
			assert.Equal(t, tt.wantPage, resp.Page)
			assert.Equal(t, tt.wantPageSize, resp.PageSize)
			assert.Equal(t, []string{"a"}, resp.Data)
		})
	}
}

func TestNewPaginatedResponseNilItemsMarshalAsEmptyArray(t *testing.T) {
	b, err := json.Marshal(NewPaginatedResponse[string](nil, 0, 1, 10))
	assert.NoError(t, err)
	assert.JSONEq(t, `{"data":[],"total":0,"page":1,"pageSize":10,"totalPages":0}`, string(b))
}

func TestNewPaginatedResponseHugeTotalDoesNotOverflow(t *testing.T) {
	resp := NewPaginatedResponse([]string{}, math.MaxInt, 1, 10)
	assert.Equal(t, math.MaxInt/10+1, resp.TotalPages)
}

func TestValidationErrorsErr(t *testing.T) {
	var none ValidationErrors
	assert.NoError(t, none.Err())

	errs := ValidationErrors{{Field: "name", Message: "required"}}
	assert.Equal(t, errs, errs.Err())
}

func TestValidationErrorsError(t *testing.T) {
	var none ValidationErrors
	assert.Equal(t, "0 validation error(s)", none.Error())

	errs := ValidationErrors{
		{Field: "name", Message: "required"},
		{Field: "name", Message: "too long"},
	}
	assert.Equal(t, "2 validation error(s)", errs.Error())
}

func TestValidationErrorsToMap(t *testing.T) {
	errs := ValidationErrors{
		{Field: "name", Message: "required"},
		{Field: "name", Message: "too long"},
		{Field: "payload", Message: "invalid"},
	}
	m := errs.ToMap()
	assert.Equal(t, []string{"required", "too long"}, m["name"])
	assert.Equal(t, []string{"invalid"}, m["payload"])
	assert.Len(t, m, 2)

	// Empty input yields an empty (non-nil) map.
	empty := ValidationErrors{}.ToMap()
	assert.NotNil(t, empty)
	assert.Empty(t, empty)
}
