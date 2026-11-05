import type { IncomingMessage } from 'node:http';
import { register } from 'node:module';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

// Configured by the standard OTEL_* variables. With no endpoint set, telemetry stays off.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // This project is ESM, so imports need the hook before they can be patched.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const repoUrl = process.env.VCS_REPOSITORY_URL_FULL;
  const revision = process.env.VCS_REF_HEAD_REVISION;
  if (repoUrl && revision) {
    process.env.OTEL_RESOURCE_ATTRIBUTES = [
      process.env.OTEL_RESOURCE_ATTRIBUTES,
      `vcs.repository.url.full=${repoUrl}`,
      `vcs.ref.head.revision=${revision}`,
    ]
      .filter(Boolean)
      .join(',');
  }

  const sdk = new NodeSDK({
    // The -proto exporters send http/protobuf, the only format Bluebox ingest accepts.
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        // A reader built in code ignores this variable unless it is passed along.
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || undefined,
      }),
    ],
    // Request logs carry selfie tokens and client IPs, so logs stay on stdout only.
    logRecordProcessors: [],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          // `t` is the selfie link token.
          redactedQueryParamsServer: ['t'],
          requestHook: (span, request) => {
            if ('httpVersion' in (request as IncomingMessage)) {
              span.setAttribute('client.address', 'redacted');
              span.setAttribute('network.peer.address', 'redacted');
            }
          },
        },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
