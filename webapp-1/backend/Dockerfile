# Use the latest version of Go as the base image
FROM golang:1.24 AS base

# Install needed dependencies for base image and update certs
RUN apt-get update \
  && apt-get install -y make openssh-client ca-certificates unzip \
    && update-ca-certificates

# create a build artifact
FROM base AS builder
# Set the working directory to the root of the project
WORKDIR /app

# Copy the Go dependencies file and download the dependencies
COPY go.mod .
COPY go.sum .
RUN go mod download

# Copy the Makefile and the rest of the source code. NOTE: the generated
# go-swagger/protobuf code is gitignored, so build from a working tree where
# `make generate-all` has already run (not a bare git clone). .dockerignore
# keeps .git/data/.env out of the build context.
COPY Makefile .
COPY . ./

# Build the application (binary name = APP=dollbuilder from the Makefile)
RUN make build

# Create a new, smaller image based on the scratch image (an empty, executable image)
FROM scratch

# Copy the SSL certificates from the base image
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the built executable from the builder image
COPY --from=builder /app/dollbuilder /dollbuilder

# Set the entrypoint to the executable
ENTRYPOINT ["/dollbuilder"]
CMD ["serve"]
