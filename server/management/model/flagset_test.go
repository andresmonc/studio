package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFileFormat_IsValid(t *testing.T) {
	tests := []struct {
		name   string
		format FileFormat
		want   bool
	}{
		{"yaml", FileFormatYAML, true},
		{"json", FileFormatJSON, true},
		{"toml", FileFormatTOML, true},
		{"empty", FileFormat(""), false},
		{"wrong case", FileFormat("YAML"), false},
		{"unknown", FileFormat("xml"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.format.IsValid())
		})
	}
}
