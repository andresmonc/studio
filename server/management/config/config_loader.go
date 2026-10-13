package config

import (
	"fmt"
	"strings"

	"github.com/go-viper/mapstructure/v2"
	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/providers/posflag"
	"github.com/knadh/koanf/v2"
	"github.com/spf13/pflag"
)

const EnvPrefix = "GOFF_MGMT_"

func Load(flags *pflag.FlagSet) (*Config, error) {
	k := koanf.New(".")

	// The confmap, env and posflag providers never return an error and koanf
	// only fails a merge with StrictMerge (off), so those Loads can't fail.
	_ = k.Load(confmap.Provider(structToMap(Default()), "."), nil)

	if flags != nil {
		if cfgPath, _ := flags.GetString("config"); cfgPath != "" {
			fk := koanf.New(".")
			if err := fk.Load(file.Provider(cfgPath), yaml.Parser()); err != nil {
				return nil, fmt.Errorf("load config file %s: %w", cfgPath, err)
			}
			// Lowercase file keys like every other source; a camelCase key
			// (auth.cookieSecure) would otherwise be a distinct entry that
			// mapstructure prefers over the env/flag override.
			lower := make(map[string]any, len(fk.Keys()))
			for key, v := range fk.All() {
				lower[strings.ToLower(key)] = v
			}
			_ = k.Load(confmap.Provider(lower, "."), nil)
		}
	}

	envCb := func(s string) string {
		s = strings.TrimPrefix(s, EnvPrefix)
		s = strings.ToLower(s)
		return strings.ReplaceAll(s, "_", ".")
	}
	_ = k.Load(env.Provider(EnvPrefix, ".", envCb), nil)

	if flags != nil {
		_ = k.Load(posflag.Provider(flags, ".", k), nil)
	}

	// koanf's default hooks plus string->slice, so comma-separated env values
	// (GOFF_MGMT_AUTH_ADMINEMAILS=a@x,b@x) become lists instead of one element.
	var out Config
	if err := k.UnmarshalWithConf("", &out, koanf.UnmarshalConf{
		Tag: "koanf",
		DecoderConfig: &mapstructure.DecoderConfig{
			DecodeHook: mapstructure.ComposeDecodeHookFunc(
				mapstructure.StringToTimeDurationHookFunc(),
				mapstructure.StringToSliceHookFunc(","),
				mapstructure.TextUnmarshallerHookFunc()),
			WeaklyTypedInput: true,
		},
	}); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}
	return &out, nil
}

// structToMap returns default values keyed using the same lowercase scheme
// produced by the env-var callback and the file loader (see Load). Keeping all sources on a
// single key-casing convention avoids koanf storing duplicate entries
// ("auth.cookieSecure" vs "auth.cookiesecure") that mapstructure would then
// resolve non-deterministically.
func structToMap(c Config) map[string]any {
	return map[string]any{
		"server.port":            c.Server.Port,
		"server.shutdowntimeout": c.Server.ShutdownTimeout,
		"server.enableswagger":   c.Server.EnableSwagger,
		"server.multicompany":    c.Server.MultiCompany,
		"db.maxconns":            c.DB.MaxConns,
		"db.minconns":            c.DB.MinConns,
		"db.connmaxlifetime":     c.DB.ConnMaxLifetime,
		"oidc.scopes":            c.OIDC.Scopes,
		"auth.sessionmaxage":     c.Auth.SessionMaxAge,
		"auth.cookiesecure":      c.Auth.CookieSecure,
		"auth.postloginredirect": c.Auth.PostLoginRedirect,
		"log.level":              c.Log.Level,
		"log.format":             c.Log.Format,
	}
}

func RegisterFlags(fs *pflag.FlagSet) {
	fs.String("config", "", "Path to YAML config file")
	fs.Int("server.port", 0, "HTTP server port")
	fs.Bool("server.multicompany", false, "Enable multi-company mode (default: mono company)")
	fs.String("db.url", "", "PostgreSQL DSN")
	fs.String("log.level", "", "Log level (debug|info|warn|error)")
}
