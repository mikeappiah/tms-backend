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

      // Format deadline for display
      const formattedDeadline = new Date(task.deadline).toLocaleString('en-US', {
        weekday: 'long',
        month: 'long', 
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      });

      // Create nicely formatted email string for task assignment
      const assignmentEmailContent = `
Dear ${user.name},

You have been assigned a new task in the task management system.

TASK DETAILS:
---------------------------------
Name: ${task.name}
Description: ${task.description}
Responsibility: ${task.responsibility}
Deadline: ${formattedDeadline}
---------------------------------

Please log in to the system to view more details and track your progress.

Thank you,
Task Management System
      `.trim();

      // Create notification data object for database storage
      const assignmentNotificationData = {
        type: 'TASK_ASSIGNED',
        taskName: task.name,
        taskDescription: task.description,
        taskResponsibility: task.responsibility,
        deadline: task.deadline,
        recipientName: `${user.name}`.trim(),
        message: `Task "${task.name}" has been assigned to you. Deadline: ${formattedDeadline}`,
        taskId: task.taskId
      };

      console.log(`Sending task assignment notification to ${user.email}`);
      
      // Send only the formatted email content to SNS (not the JSON)
      await sns.publish({
        TopicArn: process.env.TASK_ASSIGNMENT_TOPIC,
        Message: assignmentEmailContent,
        Subject: `New Task Assignment: ${task.name}`,
        MessageAttributes: {
          email: { DataType: 'String', StringValue: user.email },
          userId: { DataType: 'String', StringValue: user.userId }
        }
      }).promise();

      // Store the notification data in NOTIFICATIONS_TABLE
      await storeNotification(user.userId, 'TASK_ASSIGNED', {
        ...assignmentNotificationData,
        //emailContent: assignmentEmailContent
      });

      // Create nicely formatted email string for deadline notification
      const deadlineEmailContent = `
Dear ${user.name},

This is a reminder about your upcoming task deadline.

TASK DEADLINE REMINDER:
---------------------------------
Task: ${task.name}
Deadline: ${formattedDeadline}
---------------------------------

Please ensure you complete this task before the deadline.

Thank you,
Task Management System
      `.trim();

      // Create notification data object for database storage
      const deadlineNotificationData = {
        type: 'TASK_DEADLINE',
        taskId: task.taskId,
        taskName: task.name,
        deadline: task.deadline,
        recipientName: `${user.name}`.trim(),
        message: `Reminder: Task "${task.name}" is due at ${formattedDeadline}`
      };

      // Send only the formatted email content to SNS (not the JSON)
      await sns.publish({
        TopicArn: process.env.TASK_DEADLINE_TOPIC,
        Message: deadlineEmailContent,
        Subject: `Task Deadline Reminder: ${task.name}`,
        MessageAttributes: {
          email: { DataType: 'String', StringValue: user.email },
          userId: { DataType: 'String', StringValue: user.userId }
        }
      }).promise();

      // Store the notification data in NOTIFICATIONS_TABLE (with the email content)
      await storeNotification(user.userId, 'TASK_DEADLINE', {
        ...deadlineNotificationData,
        //emailContent: deadlineEmailContent
      });

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
        
        // Create nicely formatted email for imminent deadline
        const imminentDeadlineEmailContent = `
Dear ${user.name},

⚠️ URGENT REMINDER ⚠️

The following task deadline is rapidly approaching:

URGENT TASK DEADLINE:
---------------------------------
Task: ${task.name}
Description: ${task.description}
Deadline: ${formattedDeadline}
---------------------------------

Please prioritize this task as it must be completed very soon.

Thank you,
Task Management System
        `.trim();

        // Create notification data object for database storage
        const imminentNotificationData = {
          type: 'TASK_DEADLINE_IMMINENT',
          taskName: task.name,
          taskDescription: task.description,
          taskResponsibility: task.responsibility,
          deadline: task.deadline,
          recipientName: `${user.name}`.trim(),
          message: `URGENT: Task "${task.name}" deadline is approaching soon: ${formattedDeadline}`,
          taskId: task.taskId
        };

        // Sending formatted email content to SNS
        await sns.publish({
          TopicArn: process.env.TASK_DEADLINE_TOPIC,
          Message: imminentDeadlineEmailContent,
          Subject: `URGENT: Task Deadline Approaching - ${task.name}`,
          MessageAttributes: {
            email: { DataType: 'String', StringValue: user.email },
            userId: { DataType: 'String', StringValue: user.userId }
          }
        }).promise();

        // Store the notification data in NOTIFICATIONS_TABLE
        await storeNotification(user.userId, 'TASK_DEADLINE_IMMINENT', {
          ...imminentNotificationData,
          //emailContent: imminentDeadlineEmailContent
        });
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

// Helper function to store notifications in the NOTIFICATIONS_TABLE
async function storeNotification(userId, notificationType, notificationData) {
  try {
    const timestamp = new Date().toISOString();
    const notificationId = `${userId}:${timestamp}`;
    
    await dynamodb.put({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Item: {
        userId,
        notificationId,
        timestamp,
        type: notificationType,
        read: false,
        data: notificationData,
        createdAt: timestamp
      }
    }).promise();
    
    console.log(`Notification stored for user ${userId} with ID ${notificationId}`);
  } catch (error) {
    console.error('Error storing notification:', error);
    // Continue processing even if notification storage fails
  }
}