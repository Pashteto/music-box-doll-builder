package middlewares

import (
	"io"
	"net/http"

	"github.com/gofrs/uuid"

	"dollbuilder/pkg/logger"
)

// Granter is the subset of the service needed to record a Stripe purchase.
type Granter interface {
	GrantFromStripe(userID, customerID, paymentIntentID, productID string) error
}

// VerifyFunc validates a webhook and extracts the grant data.
// isGrant=false means "valid signature but not a grant event".
type VerifyFunc func(payload []byte, sigHeader string) (userID, customerID, paymentIntentID string, isGrant bool, err error)

// StripeWebhook returns an alice-compatible middleware that intercepts POST {path},
// verifies the Stripe signature on the RAW body, and grants the entitlement —
// short-circuiting before the swagger handler parses the body. All other requests
// pass straight through.
func StripeWebhook(path string, verify VerifyFunc, g Granter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost || r.URL.Path != path {
				next.ServeHTTP(w, r)
				return
			}
			body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MiB cap
			if err != nil {
				http.Error(w, "read error", http.StatusBadRequest)
				return
			}
			uidStr, cust, pi, isGrant, verr := verify(body, r.Header.Get("Stripe-Signature"))
			if verr != nil {
				logger.Log().Warnf("stripe webhook: signature verification failed: %v", verr)
				http.Error(w, "invalid signature", http.StatusBadRequest)
				return
			}
			if isGrant {
				if _, perr := uuid.FromString(uidStr); perr != nil {
					logger.Log().Warnf("stripe webhook: bad client_reference_id %q", uidStr)
					w.WriteHeader(http.StatusOK) // ack; nothing to grant
					return
				}
				if gerr := g.GrantFromStripe(uidStr, cust, pi, ""); gerr != nil {
					logger.Log().Errorf("stripe webhook: grant failed for %s: %v", uidStr, gerr)
					http.Error(w, "grant failed", http.StatusInternalServerError)
					return
				}
				logger.Log().Infof("stripe webhook: entitlement granted for %s", uidStr)
			}
			w.WriteHeader(http.StatusOK)
		})
	}
}
