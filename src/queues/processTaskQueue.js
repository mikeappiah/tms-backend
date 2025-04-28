const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event) => {
  try {
    console.log('Processing task queue messages:', JSON.stringify(event));
    
    for (const record of event.Records) {
      const message = JSON.parse(record.body);
      const { taskId, userId, action } = message;
      
      console.log(`Processing task: ${taskId} for user: ${userId}, action: ${action || 'CREATE'}`);

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
        console.error(`Task (${taskId}) or user (${userId}) not found`);
        continue; // Skipping to next record instead of failing the entire batch
      }

      const task = taskResult.Item;
      const user = userResult.Item;

      // Send assignment notification - TARGETING SPECIFIC USER
      console.log(`Sending task assignment notification to ${user.email}`);
      await sns.publish({
        TopicArn: process.env.TASK_ASSIGNMENT_TOPIC,
        Message: JSON.stringify({
          type: 'TASK_ASSIGNED',
          taskName: task.name,
          taskDescription: task.description,
          taskResponsibility: task.responsibility,
          deadline: task.deadline,
          recipientName: `${user.firstName} ${user.lastName}`.trim(),
          message: `Task "${task.name}" has been assigned to you. Deadline: ${new Date(task.deadline).toLocaleString()}`,
          taskId: task.taskId
        }),
        MessageAttributes: {
          email: { DataType: 'String', StringValue: user.email },
          userId: { DataType: 'String', StringValue: user.userId }
        }
      }).promise();

      // Deadline notification topic for deadline reminders - TARGETING SPECIFIC USER
      await sns.publish({
        TopicArn: process.env.TASK_DEADLINE_TOPIC,
        Message: JSON.stringify({
          taskId: task.taskId,
          userId: user.userId,
          taskName: task.name,
          deadline: task.deadline
        }),
        MessageAttributes: {
          email: { DataType: 'String', StringValue: user.email },
          userId: { DataType: 'String', StringValue: user.userId }
        }
      }).promise();

      // Schedule deadline notification (1 hour before)
      const deadline = new Date(task.deadline);
      const now = new Date();
      const oneHourBefore = new Date(deadline.getTime() - 60 * 60 * 1000);
      
      if (oneHourBefore > now) {
        console.log(`Scheduling deadline reminder for ${oneHourBefore.toISOString()}`);
        
        await eventbridge.putEvents({
          Entries: [
            {
              Source: 'task.management',
              DetailType: 'DeadlineNotification',
              Detail: JSON.stringify({ 
                taskId,
                userId,
                taskName: task.name,
                deadlineTime: task.deadline,
                recipientEmail: user.email // Include email for targeting
              }),
              Time: oneHourBefore
            }
          ]
        }).promise();
      } else if (deadline > now) {
        console.log(`Deadline too soon for 1-hour notice, sending immediate reminder`);
        
        // Sending immediate reminder If less than 1 hour to deadline but still in future
        await sns.publish({
          TopicArn: process.env.TASK_DEADLINE_TOPIC,
          Message: JSON.stringify({
            type: 'TASK_DEADLINE_IMMINENT',
            taskName: task.name,
            taskDescription: task.description,
            taskResponsibility: task.responsibility,
            deadline: task.deadline,
            recipientName: `${user.firstName} ${user.lastName}`.trim(),
            message: `URGENT: Task "${task.name}" deadline is approaching soon: ${new Date(task.deadline).toLocaleString()}`,
            taskId: task.taskId
          }),
          MessageAttributes: {
            email: { DataType: 'String', StringValue: user.email },
            userId: { DataType: 'String', StringValue: user.userId }
          }
        }).promise();
      }
      
      // Updating task to mark notification as sent
      await dynamodb.update({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId },
        UpdateExpression: 'SET notificationSent = :sent, lastUpdatedAt = :updated',
        ExpressionAttributeValues: {
          ':sent': true,
          ':updated': new Date().toISOString()
        }
      }).promise();
    }

    return { 
      batchItemFailures: [] // Reporting no failures
    };
  } catch (error) {
    console.error('Error processing task queue:', error);
    
    // For SQS Lambda triggers - returning the batch failures so they can be retried
    return {
      batchItemFailures: event.Records.map(record => ({
        itemIdentifier: record.messageId
      }))
    };
  }
};