package formatter

import (
	"time"

	"github.com/go-openapi/strfmt"

	apiModels "dollbuilder/internal/http/models"
	domainModels "dollbuilder/internal/models"
)

// ProjectToAPI converts a domain Project to its API representation.
func ProjectToAPI(p *domainModels.Project) *apiModels.Project {
	if p == nil {
		return nil
	}
	name := p.Name
	return &apiModels.Project{
		UUID:      strfmt.UUID(p.UUID.String()),
		Name:      &name,
		Data:      p.Data,
		Thumbnail: p.Thumbnail,
		UpdatedAt: strfmt.DateTime(p.UpdatedAt),
		CreatedAt: strfmt.DateTime(p.CreatedAt),
	}
}

// ProjectInputFromAPI converts a PUT body into a partial domain Project.
// UUID and UserUUID are set by the handler/service, not here. A nil input
// yields a non-nil zero-value Project (never nil) so the handler can safely
// set fields on the result without a nil check; the PUT body is required by
// the spec, so nil is not a real runtime case.
func ProjectInputFromAPI(in *apiModels.ProjectInput) *domainModels.Project {
	p := &domainModels.Project{}
	if in == nil {
		return p
	}
	if in.Name != nil {
		p.Name = *in.Name
	}
	if m, ok := in.Data.(map[string]interface{}); ok {
		p.Data = m
	}
	p.Thumbnail = in.Thumbnail
	if in.UpdatedAt != nil {
		p.UpdatedAt = time.Time(*in.UpdatedAt)
	}
	return p
}
