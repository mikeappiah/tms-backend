const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { taskId } = JSON.parse(event.input);

    await dynamodb.update({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'expired'
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Task status updated to expired' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};