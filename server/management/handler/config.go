package handler

import (
	"github.com/gofeatureflag/flag-management-system/server/management/config"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
)

type ConfigHandler struct{ cfg config.Config }

func NewConfigHandler(cfg config.Config) *ConfigHandler {
	return &ConfigHandler{cfg: cfg}
}

// Get godoc
// @Summary Public UI configuration (no auth, read before login)
// @Tags    config
// @Produce json
// @Success 200 {object} model.APIResponse{data=model.UIConfig}
// @Router  /config [get]
func (h *ConfigHandler) Get(c *echo.Context) error {
	return ok(c, model.UIConfig{MonoCompany: !h.cfg.Server.MultiCompany})
}
