package cache

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestCache(t *testing.T) *Cache {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis: %v", err)
	}
	t.Cleanup(mr.Close)
	return NewCache(redis.NewClient(&redis.Options{Addr: mr.Addr()}))
}

func TestSessionUserCache(t *testing.T) {
	c := newTestCache(t)
	ctx := context.Background()
	if _, ok := c.GetSessionUserID(ctx, "h1"); ok {
		t.Fatal("expected miss")
	}
	c.SetSessionUserID(ctx, "h1", "user-123", time.Minute)
	got, ok := c.GetSessionUserID(ctx, "h1")
	if !ok || got != "user-123" {
		t.Fatalf("expected hit user-123, got %q ok=%v", got, ok)
	}
	c.DeleteSession(ctx, "h1")
	if _, ok := c.GetSessionUserID(ctx, "h1"); ok {
		t.Fatal("expected miss after delete")
	}
}

func TestLoginRateLimit(t *testing.T) {
	c := newTestCache(t)
	ctx := context.Background()
	var lastAllowed bool
	for i := 0; i < 6; i++ {
		lastAllowed = c.AllowLoginAttempt(ctx, "a@b.com", 5, time.Minute)
	}
	if lastAllowed {
		t.Fatal("expected the 6th attempt to be blocked (limit 5)")
	}
}
