const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Creates a standardized API response
 */
const createResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
        'Access-Control-Allow-Credentials': true,
        'Content-Type': 'application/json'
      },
    body: JSON.stringify(body),
  };
};

exports.handler = async (event) => {
  try {
    // Validate admin access
    const claims = event.requestContext.authorizer.claims;
    const userGroups = claims["cognito:groups"] || [];

    if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
      return createResponse(
        COMMON.STATUS_CODES.FORBIDDEN,
        { error: COMMON.ERROR.ADMIN_ACCESS_REQUIRED }
      );
    }

    const params = {
      TableName: process.env.USERS_TABLE,
      FilterExpression: "#userRole = :roleValue",
      ExpressionAttributeNames: {
        "#userRole": "role"
      },
      ExpressionAttributeValues: {
        ":roleValue": COMMON.ROLE.MEMBER,
      },
    };

    const result = await dynamodb.scan(params).promise();

    return createResponse(
      COMMON.STATUS_CODES.OK,
      {
        users: result.Items,
        count: result.Count,
      }
    );
  } catch (error) {
    console.error("List users error:", error);
    
    // Handle specific error types
    return createResponse(
      COMMON.STATUS_CODES.INTERNAL_SERVER_ERROR,
      {
        error: COMMON.ERROR.FAILED_FETCH_USERS,
        message: error.message,
      }
    );
  }
};