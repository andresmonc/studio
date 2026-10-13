package handler

import (
	"net/http"
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigHandler(t *testing.T) {
	for _, tc := range []struct {
		multi bool
		mono  bool
	}{{multi: false, mono: true}, {multi: true, mono: false}} {
		cfg := config.Default()
		cfg.Server.MultiCompany = tc.multi
		c, rec := reqCtx(http.MethodGet, "")
		require.NoError(t, NewConfigHandler(cfg).Get(c))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, tc.mono, dataMap(t, decodeResp(t, rec).Data)["monoCompany"])
	}
}
