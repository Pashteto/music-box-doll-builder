package middlewares

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func TestMetrics_RecordsRequest(t *testing.T) {
	h := Metrics()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))

	req := httptest.NewRequest(http.MethodGet, "/anything", nil)
	h.ServeHTTP(httptest.NewRecorder(), req)

	// Scrape the default registry and assert our series shows up with the right labels.
	scrape := httptest.NewRecorder()
	promhttp.Handler().ServeHTTP(scrape, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := scrape.Body.String()

	if !strings.Contains(body, `http_requests_total{code="418",method="GET"}`) {
		t.Errorf("expected http_requests_total with code=418 method=GET, got:\n%s", body)
	}
	if !strings.Contains(body, "http_request_duration_seconds") {
		t.Error("expected http_request_duration_seconds in scrape output")
	}
}
