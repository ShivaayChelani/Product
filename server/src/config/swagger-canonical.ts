/** OpenAPI path definitions for /admin/canonical/* */
export const canonicalOpenApiPaths = {
  '/admin/canonical/status': {
    get: {
      tags: ['Canonical Admin'],
      summary: 'Platform canonical status counts',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Status payload' } },
    },
  },
  '/admin/canonical/metrics/dashboard': {
    get: {
      tags: ['Canonical Admin'],
      summary: 'Monitoring dashboard metrics (duplicates, verification, images, search, boundaries)',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Dashboard metrics' } },
    },
  },
  '/admin/canonical/resolve': {
    get: {
      tags: ['Canonical Admin'],
      summary: 'Resolve place by name, alias, or public ID',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
      responses: { '200': { description: 'Resolution hits' } },
    },
  },
  '/admin/canonical/search/hybrid': {
    get: {
      tags: ['Canonical Admin'],
      summary: 'Hybrid search inspector (FTS + trigram + alias + optional vectors)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'inspect', in: 'query', schema: { type: 'boolean', default: true }, description: 'Return search inspector payload with matched fields and scores' },
      ],
      responses: { '200': { description: 'Ranked hybrid hits with signal breakdown' } },
    },
  },
  '/admin/canonical/duplicates/scan': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Run geohash-blocked duplicate scan batch',
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                precision: { type: 'integer', default: 6 },
                prefixBatch: { type: 'integer', default: 100 },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Scan statistics' } },
    },
  },
  '/admin/canonical/duplicates': {
    get: {
      tags: ['Canonical Admin'],
      summary: 'List duplicate candidate pairs',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['OPEN', 'MERGED', 'DISMISSED'] } }],
      responses: { '200': { description: 'Duplicate candidates with place A/B' } },
    },
  },
  '/admin/canonical/duplicates/score': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Score a hypothetical duplicate pair',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['nameA', 'nameB', 'latA', 'lngA', 'latB', 'lngB'],
              properties: {
                nameA: { type: 'string' },
                nameB: { type: 'string' },
                latA: { type: 'number' },
                lngA: { type: 'number' },
                latB: { type: 'number' },
                lngB: { type: 'number' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Confidence score and recommended action' } },
    },
  },
  '/admin/canonical/duplicates/{id}/dismiss': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Dismiss a duplicate candidate as not duplicate',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { '200': { description: 'Updated candidate' } },
    },
  },
  '/admin/canonical/merge': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Merge duplicate places into canonical record',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['canonicalPlaceId', 'duplicatePlaceIds'],
              properties: {
                canonicalPlaceId: { type: 'string' },
                duplicatePlaceIds: { type: 'array', items: { type: 'string' } },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Merge result' } },
    },
  },
  '/admin/canonical/verification-queue': {
    get: {
      tags: ['Canonical Admin'],
      summary: 'Places awaiting verification',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Queue rows' } },
    },
  },
  '/admin/canonical/merge-logs': {
    get: {
      tags: ['Canonical Admin'],
      summary: 'Merge audit logs',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'placeId', in: 'query', schema: { type: 'string' } }],
      responses: { '200': { description: 'Merge logs' } },
    },
  },
  '/admin/canonical/places/{id}/verify': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Promote place to VERIFIED when checks pass',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { notes: { type: 'string' } },
            },
          },
        },
      },
      responses: { '200': { description: 'Verification outcome' } },
    },
  },
  '/admin/canonical/boundaries/validate-batch': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Run boundary validation batch (bbox + licensed polygons when configured)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { limit: { type: 'integer', default: 500 } } },
          },
        },
      },
      responses: { '200': { description: 'Batch stats' } },
    },
  },
  '/admin/canonical/images/{id}/pipeline': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Run media pipeline on a place image (pHash, blur, watermark heuristics, resolution)',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { '200': { description: 'Pipeline result' } },
    },
  },
  '/admin/canonical/images/{id}/verify-license': {
    post: {
      tags: ['Canonical Admin'],
      summary: 'Record license verification for an image',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['license'],
              properties: {
                license: { type: 'string' },
                licenseUrl: { type: 'string' },
                attribution: { type: 'string' },
                owner: { type: 'string' },
                commercialUse: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'License verification result' } },
    },
  },
};
