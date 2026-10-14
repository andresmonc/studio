package handler

import (
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigHandler(t *testing.T) {
	tests := []struct {
		name  string
		multi bool
		mono  bool
	}{
		{"mono company by default", false, true},
		{"multi company", true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := config.Default()
			cfg.Server.MultiCompany = tt.multi
			c, rec := reqCtx(http.MethodGet, "")
			require.NoError(t, NewConfigHandler(cfg).Get(c))
			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, tt.mono, dataMap(t, decodeResp(t, rec).Data)["monoCompany"])
		})
	}
}
