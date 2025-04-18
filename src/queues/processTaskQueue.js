const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event) => {
  try {
    for (const record of event.Records) {
      const { taskId, userId } = JSON.parse(record.body);

      // Fetch task and user details
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

      // Send assignment notification
      await sns.publish({
        TopicArn: process.env.TASK_ASSIGNMENT_TOPIC,
        Message: `Task "${task.name}" assigned to you. Deadline: ${task.deadline}`,
        MessageAttributes: {
          email: { DataType: 'String', StringValue: user.email }
        }
      }).promise();

      // Schedule deadline notification (1 hour before)
      const deadline = new Date(task.deadline);
      const scheduleTime = new Date(deadline.getTime() - 60 * 60 * 1000);
      if (scheduleTime > new Date()) {
        await eventbridge.putEvents({
          Entries: [
            {
              Source: 'task.management',
              DetailType: 'DeadlineNotification',
              Detail: JSON.stringify({ taskId, userId }),
              Time: scheduleTime
            }
          ]
        }).promise();
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Processed queue' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};