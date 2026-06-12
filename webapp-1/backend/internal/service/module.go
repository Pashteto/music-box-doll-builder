// Package service contains business logic layer implementations.
package service

import (
	"context"

	"dollbuilder/internal/cache"
	"dollbuilder/internal/repository"
	"dollbuilder/pkg/logger"
)

// RepositoryProvider provides access to a repository instance.
// This allows the repository to be retrieved after it's been initialized.
type RepositoryProvider interface {
	Repository() repository.IRepository
}

// CacheProvider supplies an optional session cache.
// *cache.Module satisfies this interface (Cache() returns nil when disabled).
type CacheProvider interface {
	Cache() *cache.Cache
}

// Module implements module.Module interface for the service layer.
// It wires the business logic service with optional dependencies such as repository.
type Module struct {
	repoProvider  RepositoryProvider
	cacheProvider CacheProvider
	service       IService
}

// NewModule creates a new service module instance.
// repoProvider can be nil when the database module is not enabled.
// cacheProvider can be nil when the cache module is not wired in.
func NewModule(repoProvider RepositoryProvider, cacheProvider CacheProvider) *Module {
	return &Module{
		repoProvider:  repoProvider,
		cacheProvider: cacheProvider,
	}
}

// Name returns the module identifier.
func (m *Module) Name() string {
	return "service"
}

// Init initializes the service module.
func (m *Module) Init(_ context.Context) error {
	logger.Log().Infof("initializing %s module", m.Name())

	// Retrieve repository from provider (after repository module has been initialized)
	var repo repository.IRepository
	if m.repoProvider != nil {
		repo = m.repoProvider.Repository()
	}

	svc := NewService(repo)

	// Attach optional session cache (nil-safe: service works without it).
	if m.cacheProvider != nil {
		if c := m.cacheProvider.Cache(); c != nil {
			svc.(*Service).SetCache(c)
			logger.Log().Info("service initialized with session cache")
		}
	}

	m.service = svc

	if repo == nil {
		logger.Log().Warn("service initialized without repository; database operations will be unavailable")
	} else {
		logger.Log().Info("service initialized with repository")
	}

	return nil
}

// Start begins module operation (no-op for service).
func (m *Module) Start(_ context.Context) error {
	logger.Log().Infof("starting %s module", m.Name())
	return nil
}

// Stop gracefully shuts down the module (no-op currently).
func (m *Module) Stop(_ context.Context) error {
	logger.Log().Infof("stopping %s module", m.Name())
	return nil
}

// HealthCheck verifies service health.
func (m *Module) HealthCheck(_ context.Context) error {
	return nil
}

// Service returns the business logic service instance.
func (m *Module) Service() IService {
	return m.service
}
