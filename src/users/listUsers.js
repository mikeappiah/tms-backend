const {
  errorResponse,
  successResponse,
  isAdmin,
  getPaginatedUsers,
  parsePaginationToken,
  formatPaginationResponse
} = require('./userUtils');

exports.handler = async (event) => {
  try {
    // Verify admin status
    if (!isAdmin(event.requestContext.authorizer.claims)) {
      return errorResponse(403, 'Admin access required');
    }

    // Get pagination parameters
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    const lastEvaluatedKey = parsePaginationToken(queryParams.nextToken);

    // Get paginated users
    const result = await getPaginatedUsers(limit, lastEvaluatedKey);

    return successResponse(200, 'Users retrieved successfully',
      formatPaginationResponse(result)
    );
  } catch (error) {
    console.error('List users error:', error);
    return errorResponse(500, 'Failed to retrieve users', {
      message: error.message
    });
  }
};