package stripe

import "testing"

func TestClientDisabledWhenNoKey(t *testing.T) {
	c := New(Config{SecretKey: ""})
	if c.Enabled() {
		t.Fatal("expected disabled client when secret key is empty")
	}
	if _, err := c.CreateCheckoutSession("uid", "user@example.com"); err != ErrNotConfigured {
		t.Fatalf("expected ErrNotConfigured when disabled, got %v", err)
	}
	if _, _, err := c.VerifyAndParse([]byte("{}"), "sig"); err != ErrNotConfigured {
		t.Fatalf("expected ErrNotConfigured for webhook when no secret, got %v", err)
	}
}

func TestClientEnabledWithKey(t *testing.T) {
	c := New(Config{SecretKey: "sk_test_x", PriceID: "price_x", SuccessURL: "https://x/ok", CancelURL: "https://x/no"})
	if !c.Enabled() {
		t.Fatal("expected enabled client when secret key is set")
	}
}
