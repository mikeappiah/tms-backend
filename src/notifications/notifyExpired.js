const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
  try {
    const { taskId, userId } = JSON.parse(event.input);

    // Fetch task and user
    const taskResult = await dynamodb.get({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise();

    const userResult = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { userId }
    }).promise();

    if (!taskResult.Item || !userResult.Item) {
      throw new Error('Task or user not found');
    }

    const task = taskResult.Item;
    const user = userResult.Item;

    // Notify assigned user
    await sns.publish({
      TopicArn: process.env.CLOSED_TASK_TOPIC,
      Message: `Task "${task.name}" has expired.`,
      MessageAttributes: {
        email: { DataType: 'String', StringValue: user.email }
      }
    }).promise();

    // Notify admins
    const adminResult = await dynamodb.scan({
      TableName: process.env.USERS_TABLE,
      FilterExpression: '#role = :role',
      ExpressionAttributeNames: { '#role': 'role' },
      ExpressionAttributeValues: { ':role': 'admin' }
    }).promise();

    for (const admin of adminResult.Items) {
      await sns.publish({
        TopicArn: process.env.CLOSED_TASK_TOPIC,
        Message: `Task "${task.name}" assigned to ${user.email} has expired.`,
        MessageAttributes: {
          email: { DataType: 'String', StringValue: admin.email }
        }
      }).promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Notifications sent for expired task' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};