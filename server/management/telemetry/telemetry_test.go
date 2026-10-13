package telemetry

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
)

// setup runs Setup with a clean OTEL env and restores the otel globals and
// flushes the providers once the test ends.
func setup(t *testing.T, env map[string]string) (func(context.Context) error, error) {
	t.Helper()
	for _, k := range []string{"OTEL_TRACES_EXPORTER", "OTEL_METRICS_EXPORTER", "OTEL_SERVICE_NAME", "OTEL_RESOURCE_ATTRIBUTES"} {
		t.Setenv(k, "")
	}
	for k, v := range env {
		t.Setenv(k, v)
	}

	tp, mp, prop := otel.GetTracerProvider(), otel.GetMeterProvider(), otel.GetTextMapPropagator()
	shutdown, err := Setup(context.Background())
	if shutdown != nil {
		t.Cleanup(func() {
			_ = shutdown(context.Background())
			otel.SetTracerProvider(tp)
			otel.SetMeterProvider(mp)
			otel.SetTextMapPropagator(prop)
		})
	}
	return shutdown, err
}

func serviceName(t *testing.T) string {
	t.Helper()
	_, span := otel.Tracer("test").Start(context.Background(), "span")
	defer span.End()
	ro, ok := span.(sdktrace.ReadOnlySpan)
	require.True(t, ok, "span should come from the SDK tracer provider")
	v, ok := ro.Resource().Set().Value(semconv.ServiceNameKey)
	require.True(t, ok, "resource should carry service.name")
	return v.AsString()
}

func TestSetup(t *testing.T) {
	shutdown, err := setup(t, nil)
	require.NoError(t, err)
	require.NotNil(t, shutdown)

	assert.IsType(t, &sdktrace.TracerProvider{}, otel.GetTracerProvider())
	assert.IsType(t, &sdkmetric.MeterProvider{}, otel.GetMeterProvider())
	assert.Subset(t, otel.GetTextMapPropagator().Fields(), []string{"traceparent", "baggage"})
	assert.Equal(t, "goff-management", serviceName(t))

	assert.NoError(t, shutdown(context.Background()))
}

func TestSetup_ServiceNameFromEnv(t *testing.T) {
	_, err := setup(t, map[string]string{"OTEL_SERVICE_NAME": "custom"})
	require.NoError(t, err)
	assert.Equal(t, "custom", serviceName(t))
}

func TestSetup_InvalidExporter(t *testing.T) {
	for _, k := range []string{"OTEL_TRACES_EXPORTER", "OTEL_METRICS_EXPORTER"} {
		t.Run(k, func(t *testing.T) {
			shutdown, err := setup(t, map[string]string{k: "bogus"})
			assert.Error(t, err)
			assert.Nil(t, shutdown)
		})
	}
}
