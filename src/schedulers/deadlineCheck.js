const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

exports.handler = async () => {
  try {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    const result = await dynamodb.scan({
      TableName: process.env.TASKS_TABLE,
      FilterExpression: '#status = :status AND deadline BETWEEN :now AND :oneHourLater',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'open',
        ':now': now.toISOString(),
        ':oneHourLater': oneHourLater.toISOString()
      }
    }).promise();

    for (const task of result.Items) {
      await sqs.sendMessage({
        QueueUrl: process.env.DEADLINE_QUEUE,
        MessageBody: JSON.stringify({ taskId: task.taskId, userId: task.userId }),
        MessageGroupId: task.taskId
      }).promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Deadline check completed' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};