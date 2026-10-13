package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFileFormat_IsValid(t *testing.T) {
	for _, f := range []FileFormat{FileFormatYAML, FileFormatJSON, FileFormatTOML} {
		assert.True(t, f.IsValid(), f)
	}
	for _, f := range []FileFormat{"", "YAML", "xml"} {
		assert.False(t, f.IsValid(), f)
	}
}
