# ADR-0002: React Router for the client application

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

The client is a TypeScript application in a repository separate from the server. It needs an organizer availability flow and public, organizer-specific booking pages. The client talks to the server API; the current product requirements do not call for server-side rendering.

## Decision

Build the client with React and TypeScript, using React Router's framework mode with SPA output. React Router's Vite integration will provide the development server and production build. Package the built static files in a Docker image and configure the web server to return the SPA entry point for client-side routes.

Keep booking rules and persistence in the server. The client uses the server API and contains no credentials or secrets in its browser bundle.

## Consequences

- React components suit the organizer and client flows, while route modules support links that include an organizer identifier.
- SPA output keeps the client independently deployable as static assets in Docker without adding a second application server.
- The container must support history fallback so direct visits and refreshes on booking routes work.
- Without runtime server rendering, page content is loaded in the browser. Revisit the rendering mode if search indexing or server-rendered previews become requirements.
- Framework mode adds conventions and setup compared with a bare React/Vite application.

## References

- [React: Creating a React App](https://react.dev/learn/creating-a-react-app)
- [React Router: Picking a Mode](https://reactrouter.com/start/modes)
- [React Router: SPA mode](https://reactrouter.com/how-to/spa)
