const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    // Verify if admin
    const claims = event.requestContext.authorizer.claims;
    const userGroups = claims['cognito:groups'] || [];
    
    if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    // Get query parameters for pagination
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    const lastEvaluatedKey = queryParams.nextToken ? 
      JSON.parse(Buffer.from(queryParams.nextToken, 'base64').toString()) : 
      undefined;

    // Scan the table with pagination
    const params = {
      TableName: process.env.USERS_TABLE,
      Limit: limit
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.scan(params).promise();

    // Prepare response with pagination token if needed
    const response = {
      users: result.Items,
      count: result.Count
    };

    if (result.LastEvaluatedKey) {
      response.nextToken = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey)
      ).toString('base64');
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('List users error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Failed to retrieve users',
        message: error.message
      })
    };
  }
};