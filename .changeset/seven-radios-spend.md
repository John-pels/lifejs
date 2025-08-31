---
"life": minor
---

Initial release of server-side Telemetry! 🎉 Life.js logging, metrics, and tracing is now under a unified telemetry interface. While offering a much simpler and intuitive DX, this interface is mainly OpenTelemetry compliant and compatible with any consumer (e.g., Sentry). Users can register their own consumers in the `life.config.ts` file or in their agents definitions.
