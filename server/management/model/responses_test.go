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
		{"huge total does not overflow", math.MaxInt, 1, 10, math.MaxInt/10 + 1, 1, 10},
		{"huge page caps so the offset cannot overflow", 10, math.MaxInt, 50, 1, math.MaxInt / 200, 50},
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

func TestValidationErrorsErr(t *testing.T) {
	errs := ValidationErrors{{Field: "name", Message: "required"}}
	tests := []struct {
		name string
		errs ValidationErrors
		want error
	}{
		{"nil is no error", nil, nil},
		{"non-empty returns itself", errs, errs},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.errs.Err())
		})
	}
}

func TestValidationErrorsError(t *testing.T) {
	tests := []struct {
		name string
		errs ValidationErrors
		want string
	}{
		{"nil", nil, "0 validation error(s)"},
		{"counts every entry", ValidationErrors{
			{Field: "name", Message: "required"},
			{Field: "name", Message: "too long"},
		}, "2 validation error(s)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.errs.Error())
		})
	}
}

func TestValidationErrorsToMap(t *testing.T) {
	tests := []struct {
		name string
		errs ValidationErrors
		want map[string][]string
	}{
		{"groups messages by field", ValidationErrors{
			{Field: "name", Message: "required"},
			{Field: "name", Message: "too long"},
			{Field: "payload", Message: "invalid"},
		}, map[string][]string{"name": {"required", "too long"}, "payload": {"invalid"}}},
		// assert.Equal tells a nil map from an empty one, so this pins non-nil.
		{"empty input yields an empty non-nil map", ValidationErrors{}, map[string][]string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.errs.ToMap())
		})
	}
}
