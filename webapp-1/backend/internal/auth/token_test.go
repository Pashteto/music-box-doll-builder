package auth

import "testing"

func TestNewSessionTokenUnique(t *testing.T) {
	a, err := NewSessionToken()
	if err != nil {
		t.Fatalf("NewSessionToken: %v", err)
	}
	b, _ := NewSessionToken()
	if a == "" || a == b {
		t.Fatalf("expected two unique non-empty tokens, got %q and %q", a, b)
	}
}

func TestHashTokenStable(t *testing.T) {
	tok, _ := NewSessionToken()
	if HashToken(tok) != HashToken(tok) {
		t.Fatal("HashToken must be deterministic")
	}
	if HashToken(tok) == tok {
		t.Fatal("stored hash must differ from raw token")
	}
}
