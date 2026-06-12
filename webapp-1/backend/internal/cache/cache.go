package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache wraps Redis with session-cache and rate-limit operations.
type Cache struct{ rdb *redis.Client }

// NewCache constructs a Cache around a Redis client.
func NewCache(rdb *redis.Client) *Cache { return &Cache{rdb: rdb} }

func sessKey(tokenHash string) string { return "sess:" + tokenHash }
func rlKey(id string) string          { return "rl:login:" + id }

// GetSessionUserID returns the cached user id for a session token hash.
func (c *Cache) GetSessionUserID(ctx context.Context, tokenHash string) (string, bool) {
	v, err := c.rdb.Get(ctx, sessKey(tokenHash)).Result()
	if err != nil {
		return "", false
	}
	return v, true
}

// SetSessionUserID caches the user id for a session token hash.
func (c *Cache) SetSessionUserID(ctx context.Context, tokenHash, userID string, ttl time.Duration) {
	c.rdb.Set(ctx, sessKey(tokenHash), userID, ttl)
}

// DeleteSession evicts a cached session (on logout/expiry).
func (c *Cache) DeleteSession(ctx context.Context, tokenHash string) {
	c.rdb.Del(ctx, sessKey(tokenHash))
}

// AllowLoginAttempt increments the attempt counter for id and reports whether
// the attempt is allowed (<= limit within the window). Fail-open on cache error.
func (c *Cache) AllowLoginAttempt(ctx context.Context, id string, limit int64, window time.Duration) bool {
	n, err := c.rdb.Incr(ctx, rlKey(id)).Result()
	if err != nil {
		return true
	}
	if n == 1 {
		c.rdb.Expire(ctx, rlKey(id), window)
	}
	return n <= limit
}
