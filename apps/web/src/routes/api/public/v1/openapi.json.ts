import { createFileRoute } from '@tanstack/react-router'
import { config } from '@/lib/server/config'

export const Route = createFileRoute('/api/public/v1/openapi/json')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/openapi.json
       * Returns the OpenAPI 3.1 specification for the public end-user API.
       *
       * Public endpoint – no authentication required.
       */
      GET: async () => {
        const { buildPublicOpenApiDocument } =
          await import('@/lib/server/domains/api/public-openapi')

        const spec = buildPublicOpenApiDocument(config.baseUrl)

        return Response.json(spec, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
