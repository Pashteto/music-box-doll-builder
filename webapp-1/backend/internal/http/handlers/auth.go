package handlers

import (
	"net/http"
	"time"

	"github.com/go-openapi/runtime"
	"github.com/go-openapi/runtime/middleware"

	"dollbuilder/internal/auth"
	"dollbuilder/internal/http/formatter"
	apimodels "dollbuilder/internal/http/models"
	authops "dollbuilder/internal/http/server/operations/auth"
	"dollbuilder/internal/service"
)

// cookieConfig carries deployment-specific cookie attributes.
type cookieConfig struct {
	Domain string
	Secure bool
	TTL    time.Duration
}

// NewCookieConfig builds a cookieConfig (exported so the http module can construct it).
func NewCookieConfig(domain string, secure bool, ttl time.Duration) cookieConfig {
	return cookieConfig{Domain: domain, Secure: secure, TTL: ttl}
}

func (c cookieConfig) set(w http.ResponseWriter, rawToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    rawToken,
		Path:     "/",
		Domain:   c.Domain,
		Expires:  time.Now().Add(c.TTL),
		HttpOnly: true,
		Secure:   c.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (c cookieConfig) clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    "",
		Path:     "/",
		Domain:   c.Domain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   c.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// Signup handler.
type Signup struct {
	svc    service.IService
	cookie cookieConfig
}

// NewSignup creates a new Signup handler.
func NewSignup(svc service.IService, cookie cookieConfig) *Signup {
	return &Signup{svc, cookie}
}

// Handle processes signup requests.
func (h *Signup) Handle(params authops.SignupParams) middleware.Responder {
	email := string(*params.Body.Email)
	user, err := h.svc.SignUp(email, *params.Body.Password, params.HTTPRequest.UserAgent())
	switch err {
	case service.ErrEmailTaken:
		return authops.NewSignupConflict().WithPayload(DefaultError(http.StatusConflict, err, nil))
	case service.ErrWeakPassword:
		return authops.NewSignupBadRequest().WithPayload(DefaultError(http.StatusBadRequest, err, nil))
	case nil:
		// fall through
	default:
		return authops.NewSignupInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	_, raw, lerr := h.svc.Login(email, *params.Body.Password, params.HTTPRequest.UserAgent())
	if lerr != nil {
		return authops.NewSignupInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, lerr, nil))
	}
	result := &apimodels.AuthResult{User: formatter.UserToAPI(user)}
	return middleware.ResponderFunc(func(w http.ResponseWriter, p runtime.Producer) {
		h.cookie.set(w, raw)
		authops.NewSignupOK().WithPayload(result).WriteResponse(w, p)
	})
}

// Login handler.
type Login struct {
	svc    service.IService
	cookie cookieConfig
}

// NewLogin creates a new Login handler.
func NewLogin(svc service.IService, cookie cookieConfig) *Login {
	return &Login{svc, cookie}
}

// Handle processes login requests.
func (h *Login) Handle(params authops.LoginParams) middleware.Responder {
	user, raw, err := h.svc.Login(string(*params.Body.Email), *params.Body.Password, params.HTTPRequest.UserAgent())
	if err == service.ErrInvalidCredentials {
		return authops.NewLoginUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, err, nil))
	}
	if err != nil {
		return authops.NewLoginInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	result := &apimodels.AuthResult{User: formatter.UserToAPI(user)}
	return middleware.ResponderFunc(func(w http.ResponseWriter, p runtime.Producer) {
		h.cookie.set(w, raw)
		authops.NewLoginOK().WithPayload(result).WriteResponse(w, p)
	})
}

// Logout handler.
type Logout struct {
	svc    service.IService
	cookie cookieConfig
}

// NewLogout creates a new Logout handler.
func NewLogout(svc service.IService, cookie cookieConfig) *Logout {
	return &Logout{svc, cookie}
}

// Handle processes logout requests.
func (h *Logout) Handle(params authops.LogoutParams) middleware.Responder {
	if c, err := params.HTTPRequest.Cookie(auth.SessionCookieName); err == nil {
		_ = h.svc.Logout(c.Value)
	}
	return middleware.ResponderFunc(func(w http.ResponseWriter, p runtime.Producer) {
		h.cookie.clear(w)
		authops.NewLogoutNoContent().WriteResponse(w, p)
	})
}

// GetMe handler — reads the user injected by SessionAuth middleware.
type GetMe struct{ svc service.IService }

// NewGetMe creates a new GetMe handler.
func NewGetMe(svc service.IService) *GetMe {
	return &GetMe{svc}
}

// Handle processes get-me requests.
func (h *GetMe) Handle(params authops.GetMeParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return authops.NewGetMeUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	return authops.NewGetMeOK().WithPayload(formatter.UserToAPI(user))
}
