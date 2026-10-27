package service

import (
	"testing"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

type relayProxyFile struct {
	Server struct {
		Mode string `yaml:"mode"`
		Port int    `yaml:"port"`
	} `yaml:"server"`
	FlagSets []struct {
		Name            string   `yaml:"name"`
		PollingInterval int      `yaml:"pollingInterval"`
		APIKeys         []string `yaml:"apiKeys"`
		Retrievers      []struct {
			Kind  string `yaml:"kind"`
			URI   string `yaml:"uri"`
			Table string `yaml:"table"`
		} `yaml:"retrievers"`
	} `yaml:"flagSets"`
}

const testDBURI = "postgres://goff_relay:<password>@db.internal:5432/goff_mgmt"

func parseRelayProxyConfig(t testing.TB, flagsets []model.RelayProxyFlagset) (string, relayProxyFile) {
	t.Helper()
	out, err := renderRelayProxyConfig(flagsets, testDBURI)
	require.NoError(t, err)
	var f relayProxyFile
	require.NoError(t, yaml.Unmarshal([]byte(out), &f), out)
	return out, f
}

func TestRenderRelayProxyConfig(t *testing.T) {
	tests := []struct {
		name         string
		flagsets     []model.RelayProxyFlagset
		wantNames    []string
		wantKeys     [][]string
		wantContains []string
	}{
		{
			name:         "no flagsets",
			wantContains: []string{"# No flagset with an API key in this company yet."},
		},
		{
			name: "several flagsets keep their keys in order",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "prod", TeamName: "Platform", APIKeys: []string{"goff_a", "goff_b"}},
				{ID: "id-2", Name: "dev", TeamName: "Web", APIKeys: []string{"goff_c"}},
			},
			wantNames:    []string{"id-1", "id-2"},
			wantKeys:     [][]string{{"goff_a", "goff_b"}, {"goff_c"}},
			wantContains: []string{"# Platform / prod", "# Web / dev"},
		},
		{
			name: "keyless flagset is skipped",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "empty", TeamName: "Platform", APIKeys: []string{}},
				{ID: "id-2", Name: "prod", TeamName: "Platform", APIKeys: []string{"goff_a"}},
			},
			wantNames:    []string{"id-2"},
			wantKeys:     [][]string{{"goff_a"}},
			wantContains: []string{"# Platform / empty\n  # skipped: no API key"},
		},
		{
			name: "only keyless flagsets emit no flagSets key",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "empty", TeamName: "Platform"},
			},
			wantContains: []string{"# No flagset with an API key in this company yet.", "# skipped: no API key"},
		},
		{
			name: "newline in a name stays in the comment",
			flagsets: []model.RelayProxyFlagset{
				{ID: "id-1", Name: "a\nflagSets: []\r", TeamName: "T\neam", APIKeys: []string{"goff_a"}},
			},
			wantNames:    []string{"id-1"},
			wantKeys:     [][]string{{"goff_a"}},
			wantContains: []string{"# T eam / a flagSets: [] "},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, f := parseRelayProxyConfig(t, tt.flagsets)
			assert.Equal(t, "http", f.Server.Mode)
			assert.Equal(t, 1031, f.Server.Port)
			require.Len(t, f.FlagSets, len(tt.wantNames))
			for i, fs := range f.FlagSets {
				assert.Equal(t, tt.wantNames[i], fs.Name)
				assert.Equal(t, 60000, fs.PollingInterval)
				assert.Equal(t, tt.wantKeys[i], fs.APIKeys)
				require.Len(t, fs.Retrievers, 1)
				assert.Equal(t, "postgresql", fs.Retrievers[0].Kind)
				assert.Equal(t, "goff_flags", fs.Retrievers[0].Table)
				assert.Equal(t, testDBURI, fs.Retrievers[0].URI)
			}
			for _, s := range tt.wantContains {
				assert.Contains(t, out, s)
			}
		})
	}
}

// Flagset and team names are free-form user input written into comments: no
// name may break the YAML or change which flagsets are served.
func FuzzRenderRelayProxyConfig(f *testing.F) {
	for _, seed := range []string{"prod", "a\nflagSets: []\r", "# x", "\"quoted\"", "key: value", "\u2028", "\x85\x00\xff"} {
		f.Add(seed, seed)
	}
	f.Fuzz(func(t *testing.T, name, team string) {
		_, got := parseRelayProxyConfig(t, []model.RelayProxyFlagset{
			{ID: "id-1", Name: name, TeamName: team, APIKeys: []string{"goff_a"}},
		})
		require.Len(t, got.FlagSets, 1)
		assert.Equal(t, "id-1", got.FlagSets[0].Name)
		assert.Equal(t, []string{"goff_a"}, got.FlagSets[0].APIKeys)
	})
}

func TestRelayProxyDBURI(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		port     uint16
		database string
		want     string
	}{
		{"host and database", "db.internal", 5432, "goff_mgmt", "postgres://goff_relay:<password>@db.internal:5432/goff_mgmt"},
		{"custom port", "localhost", 6543, "goff", "postgres://goff_relay:<password>@localhost:6543/goff"},
		{"ipv6 host is bracketed", "::1", 5432, "goff", "postgres://goff_relay:<password>@[::1]:5432/goff"},
		{"unix socket host stays a placeholder", "/var/run/postgresql", 5432, "goff", "postgres://goff_relay:<password>@<host>:5432/goff"},
		{"missing host and database", "", 5432, "", "postgres://goff_relay:<password>@<host>:5432/<db>"},
		{"database name is escaped", "db", 5432, "my db/x", "postgres://goff_relay:<password>@db:5432/my%20db%2Fx"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, relayProxyDBURI(tt.host, tt.port, tt.database))
		})
	}
}
