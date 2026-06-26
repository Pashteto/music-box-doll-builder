package middlewares

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

//nolint:gochecknoglobals // Prometheus collectors are registered once at package load.
var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests by method and status code.",
		},
		[]string{"method", "code"},
	)
	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency in seconds by method and status code.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "code"},
	)
	httpRequestsInFlight = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "Number of HTTP requests currently being served.",
		},
	)
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Metrics records request count, latency, and in-flight gauge for every request.
// Labels are limited to method + status code to keep cardinality bounded.
func Metrics() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			httpRequestsInFlight.Inc()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(rec, r)

			httpRequestsInFlight.Dec()
			code := strconv.Itoa(rec.status)
			httpRequestsTotal.WithLabelValues(r.Method, code).Inc()
			httpRequestDuration.WithLabelValues(r.Method, code).Observe(time.Since(start).Seconds())
		})
	}
}
