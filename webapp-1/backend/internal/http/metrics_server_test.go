package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewMetricsServer_ServesMetrics(t *testing.T) {
	srv := newMetricsServer(9100, "test")
	rec := httptest.NewRecorder()
	srv.Handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "go_goroutines") {
		t.Error("expected default Go collector metrics in output")
	}
	if !strings.Contains(body, `dollbuilder_build_info{version="test"}`) {
		t.Errorf("expected build_info with version label, got:\n%s", body)
	}
}
