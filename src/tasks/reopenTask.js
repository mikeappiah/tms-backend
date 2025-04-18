const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    if (claims['custom:role'] !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const taskId = event.pathParameters.taskId;
    const { userId } = JSON.parse(event.body);

    // Verify user exists
    const userResult = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { userId }
    }).promise();

    if (!userResult.Item) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Update task
    await dynamodb.update({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: 'SET #status = :status, userId = :userId, completedAt = :completedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'open',
        ':userId': userId,
        ':completedAt': null
      }
    }).promise();

    // Send to TaskQueue for notification
    await sqs.sendMessage({
      QueueUrl: process.env.TASK_QUEUE,
      MessageBody: JSON.stringify({ taskId, userId }),
      MessageGroupId: taskId
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Task reopened' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};