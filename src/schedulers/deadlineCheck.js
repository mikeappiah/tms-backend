const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async () => {
  try {
    console.log("Starting deadline check process");
    
    // Get current time and one hour later
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    
    console.log(`Checking for tasks with deadlines between ${now.toISOString()} and ${oneHourLater.toISOString()}`);

    // Find tasks approaching deadline
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

    console.log(`Found ${result.Items.length} tasks approaching deadline`);

    // Process each task
    const processedTasks = [];
    for (const task of result.Items) {
      try {
        // Notify the assigned user about approaching deadline
        await sns.publish({
          TopicArn: process.env.TASK_DEADLINE_TOPIC,
          Message: JSON.stringify({
            message: `DEADLINE APPROACHING: Your task "${task.name}" is due within the next hour!`,
            taskId: task.taskId,
            taskName: task.name,
            taskDescription: task.description,
            deadline: task.deadline,
            status: task.status,
            urgency: 'high'
          }),
          Subject: `Urgent: Task Deadline Approaching - ${task.name}`,
          MessageAttributes: {
            userId: { DataType: 'String', StringValue: task.userId }
          }
        }).promise();
        
        // Update task to mark it as notified
        await dynamodb.update({
          TableName: process.env.TASKS_TABLE,
          Key: { taskId: task.taskId },
          UpdateExpression: 'SET deadlineNotified = :notified, lastUpdatedAt = :lastUpdatedAt',
          ExpressionAttributeValues: {
            ':notified': true,
            ':lastUpdatedAt': new Date().toISOString()
          }
        }).promise();
        
        processedTasks.push({
          taskId: task.taskId,
          name: task.name,
          userId: task.userId,
          deadline: task.deadline
        });
      } catch (taskError) {
        console.error(`Error processing task ${task.taskId}:`, taskError);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        message: 'Deadline check completed successfully',
        tasksProcessed: processedTasks.length,
        tasks: processedTasks
      })
    };
  } catch (error) {
    console.error('Deadline check error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        code: error.code || 'InternalServerError'
      })
    };
  }
};