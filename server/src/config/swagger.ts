import swaggerJsdoc from 'swagger-jsdoc';
import { canonicalOpenApiPaths } from './swagger-canonical';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PalSaSafar API',
      version: '1.0.0',
      description: `Tourism Places API with user auth, admin roles, place submission, image upload, and geo queries.

## Auth Flow
1. \`POST /auth/register\` — Create account → returns \`{ user, token }\`
2. \`POST /auth/login\` — Login → returns \`{ user, token, streak, dailyXpAwarded }\`
3. Include the token in all authenticated requests: \`Authorization: Bearer <token>\`

## Rate Limiting
| Endpoint | Limit |
|---|---|
| Global /api/* | 100 req / 15 min |
| POST /auth/login | 120 failed attempts / 15 min (successful logins skipped) |
| POST /upload/* | 20 req / hour |
| GET/POST /places/:id/stats | 30 req / min |


## Standard Response Format
\`\`\`json
{
  "success": true,
  "data": { ... },
  "message": "Success",
  "pagination": { "page": 1, "limit": 20, "total": 50, "totalPages": 3, "hasNext": true, "hasPrev": false },
  "correlationId": "uuid"
}
\`\`\`

## Error Response Format
\`\`\`json
{
  "success": false,
  "data": null,
  "message": "Description of the error",
  "errors": [{ "field": "email", "message": "Invalid email" }],
  "correlationId": "uuid"
}
\`\`\``,
      contact: {
        name: 'PalSaSafar Team',
      },
    },
    servers: [
      { url: '/api/v1', description: 'API v1' },
      { url: '/api', description: 'Legacy API' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { nullable: true, example: null },
            message: { type: 'string', example: 'Validation failed' },
            errors: { type: 'array', items: { type: 'object' }, example: [{ field: 'email', message: 'Invalid email format' }] },
          },
        },
        Error401: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { nullable: true, example: null },
            message: { type: 'string', example: 'Authentication required. Provide a valid JWT via Authorization: Bearer <token>' },
          },
        },
        Error403: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { nullable: true, example: null },
            message: { type: 'string', example: 'Insufficient permissions. Admin role required.' },
          },
        },
        Error404: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { nullable: true, example: null },
            message: { type: 'string', example: 'Resource not found.' },
          },
        },
        Error409: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { nullable: true, example: null },
            message: { type: 'string', example: 'Email already in use.' },
          },
        },
        Error429: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { nullable: true, example: null },
            message: { type: 'string', example: 'Too many requests. Try again later.' },
          },
        },
        Error500: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { nullable: true, example: null },
            message: { type: 'string', example: 'Internal server error.' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 5 },
            hasNext: { type: 'boolean', example: true },
            hasPrev: { type: 'boolean', example: false },
          },
        },
        RegisterInput: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Ravi Sharma' },
            email: { type: 'string', format: 'email', example: 'ravi@example.com' },
            password: { type: 'string', format: 'password', example: 'SecurePass123!' },
          },
          required: ['name', 'email', 'password'],
        },
        LoginInput: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', format: 'password', example: 'YourPassword123!' },
          },
          required: ['email', 'password'],
        },
        AuthResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            streak: { type: 'integer', example: 3, description: 'Current login streak' },
            dailyXpAwarded: { type: 'boolean', example: true, description: 'Whether XP was awarded for today\'s login' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx4f2a3b0000abc123def456' },
            email: { type: 'string', example: 'ravi@example.com' },
            name: { type: 'string', example: 'Ravi Sharma' },
            permission: { type: 'string', enum: ['USER', 'VENDOR', 'CONTENT_CREATOR', 'ADMIN'], example: 'USER' },
            activeMode: { type: 'string', enum: ['USER', 'VENDOR', 'CONTENT_CREATOR', 'ADMIN'], example: 'USER' },
            roles: { type: 'array', description: 'Temporary legacy derived roles', items: { type: 'string', enum: ['USER', 'VENDOR', 'CONTENT_CREATOR', 'ADMIN'] }, example: ['USER'] },
            activeRole: { type: 'string', description: 'Temporary legacy alias for activeMode', example: 'USER' },
            role: { type: 'string', description: 'Legacy convenience alias for activeMode', example: 'USER' },
            verificationStatus: { type: 'string', enum: ['NONE', 'CONTRIBUTOR', 'EXPLORER', 'EXPERT_GUIDE'], example: 'EXPLORER' },
            createdAt: { type: 'string', format: 'date-time', example: '2025-01-15T10:30:00Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2025-06-01T14:22:00Z' },
          },
        },
        Place: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx4f2a3b0001abc123def456' },
            name: { type: 'string', example: 'Khajuraho Group of Monuments' },
            description: { type: 'string', example: 'A UNESCO World Heritage site famous for its stunning Nagara-style architecture and intricate erotic sculptures dating back to the Chandela dynasty (10th-12th century).' },
            latitude: { type: 'number', example: 24.8318 },
            longitude: { type: 'number', example: 79.9199 },
            category: { type: 'string', example: 'monument' },
            images: { type: 'array', items: { type: 'string' }, example: ['https://res.cloudinary.com/demo/image/upload/v1/places/khajuraho.jpg'] },
            tags: { type: 'array', items: { type: 'string' }, example: ['unesco', 'heritage', 'temple', 'architecture'] },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'], example: 'APPROVED' },
            submittedBy: { type: 'object', properties: { id: { type: 'string', example: 'clx4f2a3b0000abc123def456' }, name: { type: 'string', example: 'Ravi Sharma' }, email: { type: 'string', example: 'ravi@example.com' } } },
            approvedBy: { type: 'object', nullable: true, properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } } },
            reviewedAt: { type: 'string', nullable: true, format: 'date-time', example: '2025-01-20T09:00:00Z' },
            createdAt: { type: 'string', format: 'date-time', example: '2025-01-15T10:30:00Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2025-01-20T09:00:00Z' },
          },
        },
        PlaceNearby: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx4f2a3b0001abc123def456' },
            name: { type: 'string', example: 'Khajuraho Group of Monuments' },
            description: { type: 'string', example: 'A UNESCO World Heritage site...' },
            latitude: { type: 'number', example: 24.8318 },
            longitude: { type: 'number', example: 79.9199 },
            category: { type: 'string', example: 'monument' },
            images: { type: 'array', items: { type: 'string' } },
            distance: { type: 'number', description: 'Distance in meters', example: 1250 },
          },
        },
        PlaceStats: {
          type: 'object',
          properties: {
            views: { type: 'integer', example: 1520 },
            likes: { type: 'integer', example: 342 },
            saves: { type: 'integer', example: 89 },
            shares: { type: 'integer', example: 45 },
            gameCompletions: { type: 'integer', example: 12 },
          },
        },
        MapCluster: {
          type: 'object',
          properties: {
            latitude: { type: 'number', example: 23.25 },
            longitude: { type: 'number', example: 77.41 },
            count: { type: 'integer', example: 5 },
            placeIds: { type: 'array', items: { type: 'string' }, example: ['id1', 'id2', 'id3'] },
            categories: { type: 'array', items: { type: 'string' }, example: ['temple', 'monument'] },
            label: { type: 'string', example: '5 places' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx4f2a3b0002abc123def456' },
            action: { type: 'string', example: 'PLACE_APPROVED' },
            entityType: { type: 'string', example: 'Place' },
            entityId: { type: 'string', example: 'clx4f2a3b0001abc123def456' },
            actor: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } } },
            previousValues: { type: 'object', nullable: true, example: { status: 'PENDING' } },
            newValues: { type: 'object', nullable: true, example: { status: 'APPROVED' } },
            createdAt: { type: 'string', format: 'date-time', example: '2025-01-20T09:00:00Z' },
          },
        },
        SyncBatchResult: {
          type: 'object',
          properties: {
            results: { type: 'array', items: { type: 'object' } },
            summary: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                accepted: { type: 'integer' },
                failed: { type: 'integer' },
              },
            },
          },
        },
        GeofenceResult: {
          type: 'object',
          properties: {
            inside: { type: 'boolean' },
            place: { type: 'object', nullable: true, properties: { id: { type: 'string' }, name: { type: 'string' }, category: { type: 'string' } } },
            distance: { type: 'number', description: 'Distance in meters' },
          },
        },
        RouteResult: {
          type: 'object',
          properties: {
            waypoints: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' }, category: { type: 'string' }, order: { type: 'integer' }, distanceFromPrev: { type: 'number' } } } },
            totalDistance: { type: 'number' },
          },
        },
        HeatmapCell: {
          type: 'object',
          properties: {
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            count: { type: 'integer' },
            weight: { type: 'number' },
          },
        },
        TrendRegion: {
          type: 'object',
          properties: {
            region: { type: 'string' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            places: { type: 'integer' },
            engagement: { type: 'integer' },
            growth: { type: 'integer', description: 'Percentage growth' },
          },
        },
        PlaceScore: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            category: { type: 'string' },
            images: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            score: { type: 'number', description: '0-1 relevance score' },
            distance: { type: 'number', nullable: true },
          },
        },
        TripPlanResult: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            days: { type: 'array', items: { type: 'object', properties: { day: { type: 'integer' }, theme: { type: 'string' }, stops: { type: 'array', items: { type: 'object' } } } } },
            totalPlaces: { type: 'integer' },
            totalDistance: { type: 'number' },
            note: { type: 'string' },
          },
        },
        DiscoveryResult: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            parsed: { type: 'object', properties: { sentiment: { type: 'string' }, category: { type: 'string', nullable: true }, location: { type: 'string', nullable: true }, tags: { type: 'array', items: { type: 'string' } } } },
            places: { type: 'array', items: { type: 'object' } },
            note: { type: 'string' },
          },
        },
        UserPreferenceVector: {
          type: 'object',
          properties: {
            categories: { type: 'object' },
            tags: { type: 'object' },
            totalInteractions: { type: 'integer' },
            topCategory: { type: 'string', nullable: true },
            topTags: { type: 'array', items: { type: 'string' } },
          },
        },
        FollowUser: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            permission: { type: 'string' },
            activeMode: { type: 'string' },
            roles: { type: 'array', description: 'Temporary legacy derived roles', items: { type: 'string' } },
            activeRole: { type: 'string', description: 'Temporary legacy alias for activeMode' },
            role: { type: 'string', description: 'Legacy convenience alias for activeMode' },
            verificationStatus: { type: 'string' },
            followedAt: { type: 'string', format: 'date-time' },
          },
        },
        Collection: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            isPublic: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        TripPlan: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            days: { type: 'integer' },
            isPublished: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          description: 'Creates a new user account and returns a JWT. The user starts with 0 XP and role USER.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
          },
          responses: {
            '201': { description: 'User registered successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            '409': { description: 'Email already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error409' } } } },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login and receive JWT',
          description: 'Authenticates with email/password. Returns user object, JWT token, current streak, and whether login XP was awarded.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' }, example: { email: 'user@example.com', password: 'YourPassword123!' } } },
          },
          responses: {
            '200': { description: 'Login successful — returns user, token, streak, dailyXpAwarded', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            '401': { description: 'Invalid email or password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '429': { description: 'Too many login attempts', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error429' } } } },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user profile',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'User profile' } },
        },
      },
      '/places': {
        get: {
          tags: ['Places'],
          summary: 'List places with pagination and filters',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Paginated list of places' } },
        },
        post: {
          tags: ['Places'],
          summary: 'Submit a new place',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Place' } } } },
          responses: { '201': { description: 'Place created' } },
        },
      },
      '/places/nearby': {
        get: {
          tags: ['Places'],
          summary: 'Find places near coordinates sorted by distance',
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'radius', in: 'query', schema: { type: 'number', default: 5000 } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Nearby places sorted by distance' } },
        },
      },
      '/places/search': {
        get: {
          tags: ['Places'],
          summary: 'Full-text search across name, description, category, tags',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'tags', in: 'query', schema: { type: 'string' }, description: 'Comma-separated tags' },
            { name: 'lat', in: 'query', schema: { type: 'number' } },
            { name: 'lng', in: 'query', schema: { type: 'number' } },
            { name: 'radius', in: 'query', schema: { type: 'number', default: 50000 } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['relevance', 'popularity', 'newest', 'distance'], default: 'relevance' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Search results with pagination' } },
        },
      },
      '/places/trending': {
        get: {
          tags: ['Places'],
          summary: 'Top 20 places by engagement in the past 7 days',
          responses: { '200': { description: 'Trending places' } },
        },
      },
      '/places/hidden-gems': {
        get: {
          tags: ['Places'],
          summary: 'Places with high like-to-view ratio (10–200 views)',
          responses: { '200': { description: 'Hidden gem places' } },
        },
      },
      '/places/{id}/recommendations': {
        get: {
          tags: ['Places'],
          summary: 'Collaborative filtering recommendations (users who liked this also liked)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Recommended places' } },
        },
      },
      '/places/clusters': {
        get: {
          tags: ['Places'],
          summary: 'Get map clusters for a viewport',
          parameters: [
            { name: 'neLat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'neLng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'swLat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'swLng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'zoom', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'Clustered markers' } },
        },
      },
      '/places/mine': {
        get: {
          tags: ['Places'],
          summary: 'Get my submitted places',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'My submissions' } },
        },
      },
      '/places/{id}': {
        get: {
          tags: ['Places'],
          summary: 'Get place by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Place details' }, '404': { description: 'Not found' } },
        },
        delete: {
          tags: ['Places'],
          summary: 'Delete a place (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'Deleted' } },
        },
      },
      '/places/{id}/status': {
        patch: {
          tags: ['Places'],
          summary: 'Approve or reject a place (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['APPROVED', 'REJECTED'] } } } } } },
          responses: { '200': { description: 'Status updated' } },
        },
      },
      '/places/{id}/stats': {
        get: {
          tags: ['Places'],
          summary: 'Get place statistics',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Place stats', content: { 'application/json': { schema: { $ref: '#/components/schemas/PlaceStats' } } } } },
        },
        post: {
          tags: ['Places'],
          summary: 'Record a stat action (view, like, save, share, game_complete, checkin)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { action: { type: 'string', enum: ['view', 'like', 'save', 'share', 'game_complete', 'checkin'] } } } } } },
          responses: { '200': { description: 'Stat recorded' } },
        },
      },
      '/users': {
        get: {
          tags: ['Users'],
          summary: 'List all users (admin)',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'User list' } },
        },
      },
      '/users/{id}/role': {
        patch: {
          tags: ['Users'],
          summary: 'Update user permission and activate its mode (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { permission: { type: 'string', enum: ['USER', 'VENDOR', 'CONTENT_CREATOR', 'ADMIN'] } } } } } },
          responses: { '200': { description: 'Permission updated' } },
        },
      },
      '/upload/single': {
        post: {
          tags: ['Upload'],
          summary: 'Upload a single image',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } } } },
          responses: { '201': { description: 'Image uploaded' } },
        },
      },
      '/upload/multiple': {
        post: {
          tags: ['Upload'],
          summary: 'Upload up to 5 images',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
          responses: { '201': { description: 'Images uploaded' } },
        },
      },
      '/audit-logs': {
        get: {
          tags: ['Admin'],
          summary: 'View audit logs (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'entityType', in: 'query', schema: { type: 'string' } },
            { name: 'entityId', in: 'query', schema: { type: 'string' } },
            { name: 'action', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Audit logs' } },
        },
      },
      '/sync/batch': {
        post: {
          tags: ['Sync'],
          summary: 'Submit offline operations for processing',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { operations: { type: 'array', items: { type: 'object' } } } } } } },
          responses: { '201': { description: 'Batch queued' } },
        },
      },
      '/sync/pending': {
        get: {
          tags: ['Sync'],
          summary: 'Get pending sync items',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Pending items' } },
        },
      },
      '/sync/status': {
        get: {
          tags: ['Sync'],
          summary: 'Get sync status summary',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Sync status' } },
        },
      },
      '/social/follow/{userId}': {
        post: { tags: ['Social'], summary: 'Follow a user', security: [{ bearerAuth: [] }], parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Followed' } } },
        delete: { tags: ['Social'], summary: 'Unfollow a user', security: [{ bearerAuth: [] }], parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Unfollowed' } } },
        get: { tags: ['Social'], summary: 'Check if following a user', security: [{ bearerAuth: [] }], parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Following status', content: { 'application/json': { schema: { type: 'object', properties: { following: { type: 'boolean' } } } } } } } },
      },
      '/social/followers': {
        get: { tags: ['Social'], summary: 'Get my followers', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Followers list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/FollowUser' } } } } } } },
      },
      '/social/following': {
        get: { tags: ['Social'], summary: 'Get who I follow', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Following list' } } },
      },
      '/social/collections': {
        post: { tags: ['Social'], summary: 'Create a collection', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, isPublic: { type: 'boolean' } } } } } }, responses: { '201': { description: 'Collection created' } } },
        get: { tags: ['Social'], summary: 'List my collections', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Collections list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Collection' } } } } } } },
      },
      '/social/collections/{id}': {
        get: { tags: ['Social'], summary: 'Get collection with places', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Collection with places' } } },
        put: { tags: ['Social'], summary: 'Update collection', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } },
        delete: { tags: ['Social'], summary: 'Delete collection', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Deleted' } } },
      },
      '/social/collections/{id}/places': {
        post: { tags: ['Social'], summary: 'Add place to collection', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { placeId: { type: 'string' }, note: { type: 'string' } } } } } }, responses: { '201': { description: 'Added' } } },
      },
      '/social/collections/{id}/places/{placeId}': {
        delete: { tags: ['Social'], summary: 'Remove place from collection', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'placeId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Removed' } } },
      },
      '/social/trips': {
        post: { tags: ['Social'], summary: 'Create trip plan', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, days: { type: 'integer', default: 1 } } } } } }, responses: { '201': { description: 'Trip plan created', content: { 'application/json': { schema: { $ref: '#/components/schemas/TripPlan' } } } } } },
        get: { tags: ['Social'], summary: 'List my trip plans', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Trip plans list' } } },
      },
      '/social/trips/{id}': {
        get: { tags: ['Social'], summary: 'Get trip plan with days/stops/collaborators', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Trip plan details' } } },
        put: { tags: ['Social'], summary: 'Update trip plan', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } },
        delete: { tags: ['Social'], summary: 'Delete trip plan', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Deleted' } } },
      },
      '/social/trips/{id}/collaborators': {
        post: { tags: ['Social'], summary: 'Add collaborator to trip plan', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { userId: { type: 'string' }, role: { type: 'string', default: 'EDITOR' } } } } } }, responses: { '201': { description: 'Collaborator added' } } },
      },
      '/social/trips/{id}/collaborators/{collaboratorId}': {
        delete: { tags: ['Social'], summary: 'Remove collaborator', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'collaboratorId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Removed' } } },
      },
      '/social/verified': {
        get: { tags: ['Social'], summary: 'List verified users (explorers, guides, contributors)', responses: { '200': { description: 'Verified users' } } },
      },
      '/social/verify/{userId}': {
        put: { tags: ['Social'], summary: 'Set user verification status (admin)', security: [{ bearerAuth: [] }], parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['NONE', 'CONTRIBUTOR', 'EXPLORER', 'EXPERT_GUIDE'] } } } } } }, responses: { '200': { description: 'Verification updated' } } },
      },
      '/ai/recommendations': {
        get: {
          tags: ['AI'],
          summary: 'Personalized recommendations — content-based + user preference + hybrid',
          parameters: [
            { name: 'userId', in: 'query', schema: { type: 'string' }, description: 'User ID for personalized vector' },
            { name: 'placeId', in: 'query', schema: { type: 'string' }, description: 'Place ID for similarity mode' },
            { name: 'lat', in: 'query', schema: { type: 'number' }, description: 'Latitude for distance scoring' },
            { name: 'lng', in: 'query', schema: { type: 'number' }, description: 'Longitude for distance scoring' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'Scored places', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/PlaceScore' } } } } } },
        },
      },
      '/ai/similar/{id}': {
        get: {
          tags: ['AI'],
          summary: 'Find places similar to a given place (content-based)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'Similar places scored by content similarity' } },
        },
      },
      '/ai/user-vector/{userId}': {
        get: {
          tags: ['AI'],
          summary: 'Get user preference vector (learned categories + tags from interactions)',
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'User preference vector', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserPreferenceVector' } } } } },
        },
      },
      '/ai/trip-planner': {
        get: {
          tags: ['AI'],
          summary: 'Plan a multi-day trip — optimized itinerary with day/theme/stops',
          parameters: [
            { name: 'location', in: 'query', required: true, schema: { type: 'string' }, description: 'City or area name' },
            { name: 'lat', in: 'query', schema: { type: 'number' }, description: 'Override latitude' },
            { name: 'lng', in: 'query', schema: { type: 'number' }, description: 'Override longitude' },
            { name: 'days', in: 'query', required: true, schema: { type: 'integer', default: 1 }, description: '1-14 days' },
            { name: 'interests', in: 'query', schema: { type: 'string' }, description: 'Comma-separated: spiritual, nature, history, adventure, culture, food, relaxation' },
            { name: 'radius', in: 'query', schema: { type: 'integer', default: 30000, description: 'Search radius in meters' } },
            { name: 'pace', in: 'query', schema: { type: 'string', enum: ['relaxed', 'moderate', 'intensive'], default: 'moderate' } },
          ],
          responses: { '200': { description: 'Trip plan with daily itineraries', content: { 'application/json': { schema: { $ref: '#/components/schemas/TripPlanResult' } } } } },
        },
      },
      '/ai/discover': {
        get: {
          tags: ['AI'],
          summary: 'Natural-language discovery — "underrated waterfalls near Pachmarhi"',
          parameters: [
            { name: 'query', in: 'query', required: true, schema: { type: 'string' }, description: 'Free-text query (detects sentiment, category, location)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { '200': { description: 'Discovery results with parsed query + places', content: { 'application/json': { schema: { $ref: '#/components/schemas/DiscoveryResult' } } } } },
        },
      },
      '/ai/discover/structured': {
        get: {
          tags: ['AI'],
          summary: 'Structured discovery — explicit filters with PostGIS + sentiment scoring',
          parameters: [
            { name: 'sentiment', in: 'query', schema: { type: 'string', enum: ['underrated', 'trending', 'popular', 'general'] } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'location', in: 'query', schema: { type: 'string' } },
            { name: 'tags', in: 'query', schema: { type: 'string' }, description: 'Comma-separated' },
            { name: 'lat', in: 'query', schema: { type: 'number' } },
            { name: 'lng', in: 'query', schema: { type: 'number' } },
            { name: 'radius', in: 'query', schema: { type: 'integer', default: 50000 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { '200': { description: 'Filtered places with engagement signals' } },
        },
      },
      '/geo/nearby': {
        get: {
          tags: ['Geospatial'],
          summary: 'PostGIS radius search — places within distance, sorted by proximity',
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'radius', in: 'query', schema: { type: 'number', default: 5000, description: 'Radius in meters' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Paginated places sorted by distance' } },
        },
      },
      '/geo/clusters': {
        get: {
          tags: ['Geospatial'],
          summary: 'PostGIS grid-based map clusters for a viewport',
          parameters: [
            { name: 'neLat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'neLng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'swLat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'swLng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'zoom', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'Clustered markers with counts' } },
        },
      },
      '/geo/nearest': {
        get: {
          tags: ['Geospatial'],
          summary: 'K-nearest-neighbor search using PostGIS <-> operator',
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Nearest places with distances' } },
        },
      },
      '/geo/route': {
        get: {
          tags: ['Geospatial'],
          summary: 'Places along a route — waypoint ordering with discovered stops',
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'waypoints', in: 'query', required: true, schema: { type: 'string' }, description: 'Comma-separated place IDs' },
            { name: 'radius', in: 'query', schema: { type: 'number', default: 5000, description: 'Search radius from route' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { '200': { description: 'Ordered waypoints with distances', content: { 'application/json': { schema: { $ref: '#/components/schemas/RouteResult' } } } } },
        },
      },
      '/geo/geofence': {
        get: {
          tags: ['Geospatial'],
          summary: 'Check if coordinates are within a geofence around any place',
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'radius', in: 'query', schema: { type: 'number', default: 100, description: 'Fence radius in meters' } },
          ],
          responses: { '200': { description: 'Geofence check result', content: { 'application/json': { schema: { $ref: '#/components/schemas/GeofenceResult' } } } } },
        },
      },
      '/geo/heatmap': {
        get: {
          tags: ['Geospatial'],
          summary: 'Engagement density heatmap — weighted grid cells for a viewport',
          parameters: [
            { name: 'neLat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'neLng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'swLat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'swLng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'zoom', in: 'query', schema: { type: 'integer', default: 8 } },
            { name: 'days', in: 'query', schema: { type: 'integer', default: 30 } },
          ],
          responses: { '200': { description: 'Heatmap cells with engagement weight', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/HeatmapCell' } } } } } },
        },
      },
      '/geo/trends': {
        get: {
          tags: ['Geospatial'],
          summary: 'Tourism trends by region — place density, engagement, and growth',
          parameters: [
            { name: 'days', in: 'query', schema: { type: 'integer', default: 30 } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'Regional trend data', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TrendRegion' } } } } } },
        },
      },
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          responses: { '200': { description: 'OK' } },
        },
      },
      ...canonicalOpenApiPaths,
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
