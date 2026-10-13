package model

// UIConfig is the deployment configuration the webui needs before login.
// It is served on a PUBLIC endpoint: never put secrets in it.
type UIConfig struct {
	MonoCompany bool `json:"monoCompany"`
}
