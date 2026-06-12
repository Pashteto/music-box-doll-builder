package auth

import (
	"errors"
	"testing"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == "" {
		t.Fatal("expected non-empty hash")
	}

	ok, err := VerifyPassword("correct horse battery staple", hash)
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if !ok {
		t.Fatal("expected correct password to verify")
	}

	bad, err := VerifyPassword("wrong password", hash)
	if err != nil {
		t.Fatalf("VerifyPassword(wrong): %v", err)
	}
	if bad {
		t.Fatal("expected wrong password to fail")
	}
}

func TestHashIsSaltedPerCall(t *testing.T) {
	h1, _ := HashPassword("same")
	h2, _ := HashPassword("same")
	if h1 == h2 {
		t.Fatal("expected unique salt per hash")
	}
}

func TestVerifyPasswordMalformed(t *testing.T) {
	cases := []struct {
		name    string
		encoded string
	}{
		{"empty", ""},
		{"not-a-hash", "not-a-hash"},
		{"wrong-algo", "$argon2i$v=19$m=65536,t=1,p=4$YWJj$YWJj"},
		{"bad-base64-salt", "$argon2id$v=19$m=65536,t=1,p=4$@@@$YWJj"},
		{"bad-base64-hash", "$argon2id$v=19$m=65536,t=1,p=4$YWJj$@@@"},
		{"empty-hash-segment", "$argon2id$v=19$m=65536,t=1,p=4$YWJj$"},
		{"t=0", "$argon2id$v=19$m=65536,t=0,p=4$YWJj$YWJj"},
		{"p=0", "$argon2id$v=19$m=65536,t=1,p=0$YWJj$YWJj"},
		{"bad-version", "$argon2id$v=999$m=65536,t=1,p=4$YWJj$YWJj"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ok, err := VerifyPassword("whatever", tc.encoded)
			if ok {
				t.Error("expected ok=false")
			}
			if !errors.Is(err, ErrInvalidHash) {
				t.Errorf("expected ErrInvalidHash, got %v", err)
			}
		})
	}
}
