package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
	emw "github.com/labstack/echo/v5/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
)

func TestRouteTelemetryNamesSpanAndMetricsByRoute(t *testing.T) {
	spans := tracetest.NewSpanRecorder()
	reader := sdkmetric.NewManualReader()
	e := echo.New()
	e.Use(RouteTelemetry())
	e.Use(emw.ContextTimeout(time.Second)) // replaces the request: the route must still reach otelhttp
	e.GET("/flags/:id", func(c *echo.Context) error {
		c.Set(ContextClaimsKey, &service.Claims{UserID: "u1"})
		return c.NoContent(http.StatusNoContent)
	})
	h := otelhttp.NewHandler(e, "http.server",
		otelhttp.WithTracerProvider(sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(spans))),
		otelhttp.WithMeterProvider(sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))))

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/flags/abc123", nil))

	ended := spans.Ended()
	require.Len(t, ended, 1)
	assert.Equal(t, "GET /flags/:id", ended[0].Name())
	assert.Contains(t, ended[0].Attributes(), semconv.HTTPRoute("/flags/:id"))
	assert.Contains(t, ended[0].Attributes(), semconv.EnduserID("u1"))

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))
	var found bool
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if h, ok := m.Data.(metricdata.Histogram[float64]); ok && m.Name == "http.server.request.duration" {
				v, ok := h.DataPoints[0].Attributes.Value("http.route")
				found = ok && v.AsString() == "/flags/:id"
			}
		}
	}
	assert.True(t, found, "http.server.request.duration carries http.route")
}

func TestRouteTelemetryUnknownRouteHasNoRoute(t *testing.T) {
	spans := tracetest.NewSpanRecorder()
	e := echo.New()
	e.Use(RouteTelemetry())
	h := otelhttp.NewHandler(e, "http.server",
		otelhttp.WithTracerProvider(sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(spans))))

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/scanner/probe", nil))

	ended := spans.Ended()
	require.Len(t, ended, 1)
	for _, a := range ended[0].Attributes() {
		assert.NotEqual(t, semconv.HTTPRouteKey, a.Key, "a 404 must not label the route (cardinality)")
	}
}
