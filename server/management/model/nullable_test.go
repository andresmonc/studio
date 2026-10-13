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
		wantErr    bool
	}{
		{"absent leaves unchanged", `{}`, Nullable[int]{}, Nullable[FileFormat]{}, false},
		{"null resets", `{"pollingIntervalMs":null,"fileFormat":null}`,
			Nullable[int]{Set: true}, Nullable[FileFormat]{Set: true}, false},
		{"value sets", `{"pollingIntervalMs":10,"fileFormat":"yaml"}`,
			Nullable[int]{Set: true, Value: &ten}, Nullable[FileFormat]{Set: true, Value: &yaml}, false},
		{"wrong type errors", `{"pollingIntervalMs":"fast"}`, Nullable[int]{}, Nullable[FileFormat]{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req UpdateFlagsetRequest
			err := json.Unmarshal([]byte(tt.body), &req)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantPoll, req.PollingIntervalMs)
			assert.Equal(t, tt.wantFormat, req.FileFormat)
		})
	}
}
