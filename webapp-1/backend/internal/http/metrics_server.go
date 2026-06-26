package http

import (
	"fmt"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

//nolint:gochecknoglobals // registered once at package load.
var buildInfo = promauto.NewGaugeVec(
	prometheus.GaugeOpts{
		Name: "dollbuilder_build_info",
		Help: "Build information (value is always 1).",
	},
	[]string{"version"},
)

// newMetricsServer returns an HTTP server that exposes the Prometheus default
// registry at /metrics. It is meant to listen on an internal-only port.
func newMetricsServer(port int, version string) *http.Server {
	buildInfo.WithLabelValues(version).Set(1)
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	return &http.Server{
		Addr:              fmt.Sprintf("0.0.0.0:%d", port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
