package cache

import "github.com/redis/go-redis/v9"

// Cache wraps a Redis client with session-cache and rate-limit operations.
// Operations are added in a later step (Task 14).
type Cache struct{ rdb *redis.Client }

// NewCache constructs a Cache around a Redis client.
func NewCache(rdb *redis.Client) *Cache { return &Cache{rdb: rdb} }
