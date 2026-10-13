package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateFlagsetRequest_NullableFields(t *testing.T) {
	ten, yaml := 10, FileFormatYAML
	tests := []struct {
		name       string
		body       string
		wantPoll   Nullable[int]
		wantFormat Nullable[FileFormat]
	}{
		{"absent leaves unchanged", `{}`, Nullable[int]{}, Nullable[FileFormat]{}},
		{"null resets", `{"pollingIntervalMs":null,"fileFormat":null}`,
			Nullable[int]{Set: true}, Nullable[FileFormat]{Set: true}},
		{"value sets", `{"pollingIntervalMs":10,"fileFormat":"yaml"}`,
			Nullable[int]{Set: true, Value: &ten}, Nullable[FileFormat]{Set: true, Value: &yaml}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req UpdateFlagsetRequest
			require.NoError(t, json.Unmarshal([]byte(tt.body), &req))
			assert.Equal(t, tt.wantPoll, req.PollingIntervalMs)
			assert.Equal(t, tt.wantFormat, req.FileFormat)
		})
	}
}

func TestNullable_WrongTypeErrors(t *testing.T) {
	var req UpdateFlagsetRequest
	assert.Error(t, json.Unmarshal([]byte(`{"pollingIntervalMs":"fast"}`), &req))
}
