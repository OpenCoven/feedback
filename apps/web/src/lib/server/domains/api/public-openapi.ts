import { createDocument } from 'zod-openapi'

/**
 * Builds the OpenAPI 3.1 document for the public end-user API.
 */
export function buildPublicOpenApiDocument(baseUrl: string): ReturnType<typeof createDocument> {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'OpenCoven Feedback – Public End-User API',
      version: '1.0.0',
      description:
        'Public REST API used by the embeddable widget and first-party clients. ' +
        'Authenticated endpoints require a better-auth session token passed as `Authorization: Bearer <token>`.',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Current deployment',
      },
    ],
    tags: [
      { name: 'Config', description: 'Widget / workspace configuration' },
      { name: 'Boards', description: 'Feedback boards' },
      { name: 'Posts', description: 'Feedback posts' },
      { name: 'Comments', description: 'Post comments' },
      { name: 'Votes', description: 'Post votes' },
      { name: 'Changelog', description: 'Changelog entries' },
      { name: 'Help', description: 'Help-center categories, articles, and search' },
    ],
    paths: {
      '/api/public/v1/config': {
        get: {
          operationId: 'getPublicConfig',
          summary: 'Get widget configuration',
          tags: ['Config'],
          responses: {
            '200': { description: 'Public widget config' },
          },
        },
      },
      '/api/public/v1/boards': {
        get: {
          operationId: 'listPublicBoards',
          summary: 'List boards',
          tags: ['Boards'],
          responses: {
            '200': { description: 'List of boards' },
          },
        },
      },
      '/api/public/v1/posts': {
        get: {
          operationId: 'listPublicPosts',
          summary: 'List posts',
          tags: ['Posts'],
          responses: {
            '200': { description: 'Paginated list of posts' },
          },
        },
        post: {
          operationId: 'createPublicPost',
          summary: 'Submit a post',
          tags: ['Posts'],
          security: [{ bearerAuth: [] }],
          responses: {
            '201': { description: 'Post created' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/public/v1/posts/{postId}': {
        get: {
          operationId: 'getPublicPost',
          summary: 'Get post by ID',
          tags: ['Posts'],
          parameters: [
            {
              name: 'postId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'Post detail' },
            '404': { description: 'Post not found' },
          },
        },
      },
      '/api/public/v1/posts/{postId}/comments': {
        get: {
          operationId: 'listPublicPostComments',
          summary: 'List comments on a post',
          tags: ['Comments'],
          parameters: [
            {
              name: 'postId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'List of comments' },
          },
        },
        post: {
          operationId: 'createPublicPostComment',
          summary: 'Add a comment to a post',
          tags: ['Comments'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'postId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': { description: 'Comment created' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/public/v1/posts/{postId}/vote': {
        post: {
          operationId: 'togglePublicPostVote',
          summary: 'Toggle vote on a post',
          tags: ['Votes'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'postId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'Vote toggled' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/public/v1/changelog': {
        get: {
          operationId: 'listPublicChangelog',
          summary: 'List changelog entries',
          tags: ['Changelog'],
          responses: {
            '200': { description: 'Paginated list of changelog entries' },
          },
        },
      },
      '/api/public/v1/changelog/{entryId}': {
        get: {
          operationId: 'getPublicChangelogEntry',
          summary: 'Get changelog entry by ID',
          tags: ['Changelog'],
          parameters: [
            {
              name: 'entryId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'Changelog entry' },
            '404': { description: 'Entry not found' },
          },
        },
      },
      '/api/public/v1/help/categories': {
        get: {
          operationId: 'listHelpCategories',
          summary: 'List help-center categories',
          tags: ['Help'],
          responses: {
            '200': { description: 'List of categories' },
          },
        },
      },
      '/api/public/v1/help/articles/{slug}': {
        get: {
          operationId: 'getHelpArticle',
          summary: 'Get help article by slug',
          tags: ['Help'],
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'Help article' },
            '404': { description: 'Article not found' },
          },
        },
      },
      '/api/public/v1/help/search': {
        get: {
          operationId: 'searchHelp',
          summary: 'Search help-center articles',
          tags: ['Help'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Search query',
            },
          ],
          responses: {
            '200': { description: 'Search results' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'better-auth session token',
        },
      },
    },
  })
}
