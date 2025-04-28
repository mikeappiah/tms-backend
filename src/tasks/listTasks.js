const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    const userId = claims.sub;
    
    // Check if admin
    const userGroups = claims['cognito:groups'] || [];
    const isAdmin = userGroups.includes(process.env.ADMIN_GROUP_NAME);
    
    let result;
    
    // Admin can see all tasks
    if (isAdmin) {
      result = await dynamodb.scan({
        TableName: process.env.TASKS_TABLE
      }).promise();
    } else {
      // Regular users can only see their assigned tasks using Cognito sub ID
        result = await dynamodb.scan({
          TableName: process.env.TASKS_TABLE,
          FilterExpression: 'userId = :uid',
          ExpressionAttributeValues: {
            ':uid': userId
          }
        }).promise();
      }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Tasks retrieved successfully',
        tasks: result.Items
      })
    };
  } catch (error) {
    console.error('List tasks error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        code: error.code || 'InternalServerError',
        message: error.message
      })
    };
  }
};