// Package cache provides a Redis-backed module for session caching and
// login rate-limiting. It is optional: when disabled, callers fall back to
// Postgres-only behavior.
package cache

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"dollbuilder/config"
	"dollbuilder/pkg/logger"
)

// Module owns the Redis client lifecycle.
type Module struct {
	config *config.CacheConfig
	client *redis.Client
	cache  *Cache
}

// NewModule constructs the cache module from config.
func NewModule(cfg *config.CacheConfig) *Module { return &Module{config: cfg} }

// Name returns the module identifier.
func (m *Module) Name() string { return "cache" }

// Init initializes the Redis client and verifies connectivity.
// When disabled (config nil or Enabled=false), logs and returns nil immediately.
func (m *Module) Init(_ context.Context) error {
	if m.config == nil || !m.config.Enabled {
		logger.Log().Info("cache module disabled")
		return nil
	}

	logger.Log().Infof("initializing %s module on %s:%d", m.Name(), m.config.Host, m.config.Port)

	m.client = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", m.config.Host, m.config.Port),
		Password: m.config.Password,
		DB:       m.config.DB,
	})

	if err := m.client.Ping(context.Background()).Err(); err != nil {
		return fmt.Errorf("connect redis: %w", err)
	}

	m.cache = NewCache(m.client)

	logger.Log().Infof("%s module initialized successfully", m.Name())
	return nil
}

// Start begins module operation (no-op for cache).
func (m *Module) Start(_ context.Context) error {
	return nil
}

// Stop gracefully closes the Redis connection.
func (m *Module) Stop(_ context.Context) error {
	if m.client != nil {
		logger.Log().Infof("stopping %s module", m.Name())
		if err := m.client.Close(); err != nil {
			return fmt.Errorf("close redis connection: %w", err)
		}
		logger.Log().Info("redis connection closed")
	}
	return nil
}

// HealthCheck pings Redis. Returns nil when the module is disabled.
func (m *Module) HealthCheck(ctx context.Context) error {
	if m.client == nil {
		return nil
	}
	return m.client.Ping(ctx).Err()
}

// Cache exposes the cache operations to the service layer (nil when disabled).
func (m *Module) Cache() *Cache { return m.cache }
