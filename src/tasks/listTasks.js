const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    const userId = claims.sub;
    const role = claims['custom:role'];

    let result;
    if (role === 'admin') {
      result = await dynamodb.scan({
        TableName: process.env.TASKS_TABLE
      }).promise();
    } else {
      result = await dynamodb.query({
        TableName: process.env.TASKS_TABLE,
        IndexName: 'UserTasksIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      }).promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};