// OpenAPI 3 spec served at /api/docs (Swagger UI) and /api/docs.json
const ok = { description: 'Success' };
const err = (d) => ({ description: d, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const op = (summary, { tag, auth = null, body, params = [], query = [], codes = [] } = {}) => ({
  summary, tags: [tag],
  ...(auth && { security: [{ bearerAuth: [] }] }),
  parameters: [
    ...params.map((n) => ({ name: n, in: 'path', required: true, schema: { type: 'integer' } })),
    ...query.map((n) => ({ name: n, in: 'query', schema: { type: 'string' } })),
  ],
  ...(body && { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', example: body } } } } }),
  responses: { 200: ok, 400: err('VALIDATION_ERROR'), ...(auth && { 401: err('UNAUTHENTICATED') }), ...(auth === 'admin' && { 403: err('FORBIDDEN') }), ...Object.fromEntries(codes.map((c) => [c, err(String(c))])) },
});
const spec = {
  openapi: '3.0.3',
  info: { title: 'Hotel Platform API', version: '1.0.0', description: 'Booking & enquiry API for a Mumbai boutique hotel group. Successful responses are `{success:true,data,meta?}`; failures are `{success:false,error:{code,message,details?,requestId}}`.' },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: { Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'object' } }, requestId: { type: 'string' } } } } } },
  },
  paths: {
    '/auth/register': { post: op('Create an account', { tag: 'Auth', body: { fullName: 'Asha Rao', email: 'asha@example.com', password: 'Passw0rdOK' }, codes: [409, 429] }) },
    '/auth/login': { post: op('Log in (sets httpOnly refresh cookie)', { tag: 'Auth', body: { email: 'asha@example.com', password: 'Passw0rdOK' }, codes: [401, 429] }) },
    '/auth/refresh': { post: op('Rotate refresh token and get a new access token', { tag: 'Auth', codes: [401] }) },
    '/auth/logout': { post: op('Revoke refresh token', { tag: 'Auth' }) },
    '/auth/me': { get: op('Current user', { tag: 'Auth', auth: 'user' }) },
    '/properties': {
      get: op('List properties with starting rate and rating', { tag: 'Properties' }),
      post: op('Create property', { tag: 'Properties', auth: 'admin', body: { name: 'The Marine Lines', city: 'Mumbai', address: 'Marine Drive', imageUrl: null } }),
    },
    '/properties/{id}': {
      get: op('Property with room types and reviews', { tag: 'Properties', params: ['id'], codes: [404] }),
      put: op('Update property', { tag: 'Properties', auth: 'admin', params: ['id'], body: { name: 'The Marine Lines', city: 'Mumbai', address: 'Marine Drive' }, codes: [404] }),
      delete: op('Delete property', { tag: 'Properties', auth: 'admin', params: ['id'], codes: [404, 409] }),
    },
    '/rooms/search': { get: op('Search room types with filters', { tag: 'Search', query: ['city', 'propertyId', 'checkIn', 'checkOut', 'guests', 'minPrice', 'maxPrice', 'roomType', 'minRating', 'sort (price_asc|price_desc|rating)', 'page', 'limit'] }) },
    '/room-types': { get: op('List room types', { tag: 'Inventory', query: ['propertyId'] }), post: op('Create room type', { tag: 'Inventory', auth: 'admin', body: { propertyId: 1, canonicalName: 'Deluxe Room', capacity: 2, baseRateInr: 6500, amenities: 'WiFi, AC' } }) },
    '/room-types/{id}': { put: op('Update room type', { tag: 'Inventory', auth: 'admin', params: ['id'], body: { propertyId: 1, canonicalName: 'Deluxe Room', capacity: 2, baseRateInr: 7000 }, codes: [404] }), delete: op('Delete room type', { tag: 'Inventory', auth: 'admin', params: ['id'], codes: [404] }) },
    '/rooms': { get: op('List rooms', { tag: 'Inventory', auth: 'admin', query: ['roomTypeId'] }), post: op('Create room', { tag: 'Inventory', auth: 'admin', body: { roomTypeId: 1, roomNo: '101', status: 'active' } }) },
    '/rooms/{id}': { put: op('Update room', { tag: 'Inventory', auth: 'admin', params: ['id'], body: { roomTypeId: 1, roomNo: '101', status: 'out_of_service' } }), delete: op('Delete room', { tag: 'Inventory', auth: 'admin', params: ['id'] }) },
    '/bookings': {
      post: op('Create booking (a free room is assigned; overlaps return 409)', { tag: 'Bookings', auth: 'user', body: { roomTypeId: 1, checkIn: '2026-12-20', checkOut: '2026-12-23', guests: 2 }, codes: [404, 409] }),
      get: op('Own bookings (admin: all)', { tag: 'Bookings', auth: 'user', query: ['propertyId', 'status', 'page', 'limit'] }),
    },
    '/bookings/{id}': {
      patch: op('Change status (guests: cancel only)', { tag: 'Bookings', auth: 'user', params: ['id'], body: { status: 'cancelled' }, codes: [404, 409] }),
      delete: op('Delete booking', { tag: 'Bookings', auth: 'admin', params: ['id'], codes: [404] }),
    },
    '/enquiries': { post: op('Send an enquiry (public)', { tag: 'Enquiries', body: { propertyId: 1, name: 'Ravi', email: 'ravi@example.com', message: 'Do you have a banquet hall?' }, codes: [404] }), get: op('List enquiries', { tag: 'Enquiries', auth: 'admin' }) },
    '/enquiries/{id}': { patch: op('Update enquiry status', { tag: 'Enquiries', auth: 'admin', params: ['id'], body: { status: 'answered' }, codes: [404] }), delete: op('Delete enquiry', { tag: 'Enquiries', auth: 'admin', params: ['id'], codes: [404] }) },
    '/reviews': { get: op('Reviews for a property', { tag: 'Reviews', query: ['propertyId'] }), post: op('Review a completed stay', { tag: 'Reviews', auth: 'user', body: { bookingId: 1, rating: 5, comment: 'Lovely stay' }, codes: [403, 404, 409] }) },
    '/reviews/{id}': { delete: op('Delete review', { tag: 'Reviews', auth: 'admin', params: ['id'], codes: [404] }) },
    '/uploads': { post: { summary: 'Upload an image (JPEG/PNG/WebP, max 2 MB)', tags: ['Uploads'], security: [{ bearerAuth: [] }], requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } } } }, responses: { 201: ok, 400: err('VALIDATION_ERROR'), 401: err('UNAUTHENTICATED') } } },
    '/admin/metrics': { get: op('Occupancy %, ADR and RevPAR (totals, per property, daily trend)', { tag: 'Admin', auth: 'admin', query: ['from (YYYY-MM-DD)', 'to (YYYY-MM-DD)', 'propertyId'] }) },
    '/health': { get: op('Liveness + DB check', { tag: 'System', codes: [503] }) },
  },
};
module.exports = { spec };
