package service

import (
	"context"
	_ "embed"
	"net"
	"net/url"
	"strconv"
	"strings"
	"text/template"
	"unicode"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
)

//go:embed templates/goff-proxy.yaml.tmpl
var relayProxyTemplateText string

// The DB URI reuses Studio's host and database but never its credentials: the
// relay proxy gets its own role that only needs SELECT on goff_flags. A flagset without a key
// is commented out because the relay proxy rejects a flagset with no apiKeys,
// and an empty flagSets list would make it fall back to top-level retrievers.
var relayProxyTemplate = template.Must(template.New("goff-proxy.yaml").Funcs(template.FuncMap{
	"quote":   strconv.Quote,
	"comment": yamlComment,
}).Parse(relayProxyTemplateText))

// yamlComment keeps a free-form name on its comment line: YAML also breaks lines
// on U+0085/U+2028/U+2029 and rejects control characters, so every
// non-printable rune becomes a space (strings.Map turns invalid UTF-8 into U+FFFD).
func yamlComment(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsPrint(r) {
			return r
		}
		return ' '
	}, s)
}

// RelayProxyConfig renders the goff-proxy.yaml serving every live flagset of
// the company.
func (s *FlagsetService) RelayProxyConfig(ctx context.Context, companyID string) (string, error) {
	flagsets, err := s.repo.ListForRelayProxy(ctx, companyID)
	if err != nil {
		return "", err
	}
	return renderRelayProxyConfig(flagsets, relayProxyDBURI(s.repo.DBTarget()))
}

// relayProxyDBURI is the URI the relay proxy should use, as seen from Studio:
// the host may differ from the relay proxy's network, hence the UI tip. A unix
// socket host has no URL form, so it stays a placeholder.
func relayProxyDBURI(host string, port uint16, database string) string {
	if host == "" || strings.HasPrefix(host, "/") {
		host = "<host>"
	}
	database = url.PathEscape(database)
	if database == "" {
		database = "<db>"
	}
	return "postgres://goff_relay:<password>@" + net.JoinHostPort(host, strconv.Itoa(int(port))) + "/" + database
}

func renderRelayProxyConfig(flagsets []model.RelayProxyFlagset, dbURI string) (string, error) {
	served := false
	for _, fs := range flagsets {
		served = served || len(fs.APIKeys) > 0
	}
	var b strings.Builder
	err := relayProxyTemplate.Execute(&b, struct {
		Flagsets []model.RelayProxyFlagset
		Served   bool
		URI      string
	}{flagsets, served, dbURI})
	return b.String(), err
}
