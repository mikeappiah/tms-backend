const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
  console.log('Notify Expired Function invoked with:', JSON.stringify(event));
  
  try {
    // Extract taskId and userId from the event object
    let taskId, userId;
    
    if (typeof event === 'object') {
      if (event.taskId && event.userId) {
        // Direct object with fields
        taskId = event.taskId;
        userId = event.userId;
      } else if (event.input && typeof event.input === 'string') {
        // If input is provided as a JSON string
        const parsed = JSON.parse(event.input);
        taskId = parsed.taskId;
        userId = parsed.userId;
      } else if (event.body && typeof event.body === 'string') {
        // From API Gateway
        const parsed = JSON.parse(event.body);
        taskId = parsed.taskId;
        userId = parsed.userId;
      }
    }
    
    // Check if required data was found
    if (!taskId || !userId) {
      console.error('Missing taskId or userId in the event:', event);
      throw new Error('Missing taskId or userId in the input');
    }
    
    console.log(`Processing notification for task ${taskId} and user ${userId}`);
    
    // Fetch task and user
    const taskResult = await dynamodb.get({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise();

    const userResult = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { userId }
    }).promise();

    if (!taskResult.Item) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    
    if (!userResult.Item) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const task = taskResult.Item;
    const user = userResult.Item;

    console.log(`Sending notification about task "${task.name}" to user ${user.email}`);
    
    // Notify assigned user
    await sns.publish({
      TopicArn: process.env.CLOSED_TASK_TOPIC,
      Message: `Task "${task.name}" has expired.`,
      MessageAttributes: {
        email: { DataType: 'String', StringValue: user.email }
      }
    }).promise();

    console.log('Notifying admin users about the expired task');
    
    // Notify admins
    const adminResult = await dynamodb.scan({
      TableName: process.env.USERS_TABLE,
      FilterExpression: '#role = :role',
      ExpressionAttributeNames: { '#role': 'role' },
      ExpressionAttributeValues: { ':role': 'admin' }
    }).promise();

    for (const admin of adminResult.Items) {
      console.log(`Sending notification to admin: ${admin.email}`);
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
      body: JSON.stringify({ 
        message: 'Notifications sent for expired task',
        task: task.name,
        user: user.email,
        adminCount: adminResult.Items.length
      })
    };
  } catch (error) {
    console.error('Error sending notifications:', error);
    
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({ 
        error: error.message || 'Failed to send notifications for expired task',
        details: error.code ? `AWS Error Code: ${error.code}` : undefined
      })
    };
  }
};