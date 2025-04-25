const {
  errorResponse,
  successResponse,
  isAdmin,
  getUsername
} = require('./utils');

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    const userId = claims.sub;
    const username = getUsername(claims);

    let result;

    if (isAdmin(claims)) {
      // Admin can see all tasks
      result = await dynamodb.scan({
        TableName: process.env.TASKS_TABLE
      }).promise();
    } else {
      // Regular users can only see their assigned tasks
      result = await dynamodb.scan({
        TableName: process.env.TASKS_TABLE,
        FilterExpression: 'userId = :uid OR userId = :username',
        ExpressionAttributeValues: {
          ':uid': userId,
          ':username': username
        }
      }).promise();
    }

    return successResponse(200, 'Tasks retrieved successfully', {
      tasks: result.Items || []
    });
  } catch (error) {
    console.error('List tasks error:', error);
    return errorResponse(500, 'Internal server error', {
      code: error.code || 'InternalServerError',
      message: error.message
    });
  }
};