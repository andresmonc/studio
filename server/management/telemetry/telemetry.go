// Package telemetry wires the global OpenTelemetry providers for the management API.
package telemetry

import (
	"context"
	"errors"

	"go.opentelemetry.io/contrib/exporters/autoexport"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
)

// Setup installs the global OpenTelemetry tracer and meter providers.
// Exporters come from the standard OTEL_* env vars (OTEL_TRACES_EXPORTER,
// OTEL_METRICS_EXPORTER, OTEL_EXPORTER_OTLP_ENDPOINT, ...); when an exporter
// var is unset nothing is exported for that signal.
func Setup(ctx context.Context) (shutdown func(context.Context) error, err error) {
	// Merge so OTEL_SERVICE_NAME / OTEL_RESOURCE_ATTRIBUTES override the default name.
	res, err := resource.Merge(
		resource.NewSchemaless(semconv.ServiceName("goff-management")),
		resource.Environment(),
	)
	if err != nil {
		return nil, err
	}

	spanExp, err := autoexport.NewSpanExporter(ctx, autoexport.WithFallbackSpanExporter(
		func(context.Context) (sdktrace.SpanExporter, error) { return tracetest.NewNoopExporter(), nil }))
	if err != nil {
		return nil, err
	}
	reader, err := autoexport.NewMetricReader(ctx, autoexport.WithFallbackMetricReader(
		func(context.Context) (sdkmetric.Reader, error) { return sdkmetric.NewManualReader(), nil }))
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(spanExp), sdktrace.WithResource(res))
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader), sdkmetric.WithResource(res))
	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	shutdown = func(ctx context.Context) error { return errors.Join(tp.Shutdown(ctx), mp.Shutdown(ctx)) }
	if err := runtime.Start(); err != nil {
		return nil, errors.Join(err, shutdown(ctx))
	}
	return shutdown, nil
}
