const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
  try {
    
    const { taskId } = JSON.parse(event.input || '{}');
    
    if (!taskId) {
      console.error('Missing required taskId parameter');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing required taskId parameter' })
      };
    }
    
    // Get task details before updating
    const taskResult = await dynamodb.get({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise();
    
    if (!taskResult.Item) {
      console.error('Task not found:', taskId);
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Task not found' })
      };
    }

    // Update task status to expired
    await dynamodb.update({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: 'SET #status = :status, lastUpdatedAt = :lastUpdatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'expired',
        ':lastUpdatedAt': new Date().toISOString()
      }
    }).promise();
    
    // Notify both the assigned user and admin about expired task
    if (taskResult.Item.userId) {
      await sns.publish({
        TopicArn: process.env.TASK_NOTIFICATION_TOPIC,
        Message: JSON.stringify({
          message: `Task "${taskResult.Item.name}" has expired! The deadline was ${taskResult.Item.deadline}`,
          taskId: taskId,
          taskName: taskResult.Item.name,
          taskDescription: taskResult.Item.description,
          deadline: taskResult.Item.deadline,
          status: 'expired'
        }),
        Subject: `Task Expired: ${taskResult.Item.name}`,
        MessageAttributes: {
          userId: { DataType: 'String', StringValue: taskResult.Item.userId }
        }
      }).promise();
    }
    
    // Also notify admin group
    await sns.publish({
      TopicArn: process.env.ADMIN_NOTIFICATION_TOPIC,
      Message: JSON.stringify({
        message: `Task "${taskResult.Item.name}" assigned to user ${taskResult.Item.userId} has expired! The deadline was ${taskResult.Item.deadline}`,
        taskId: taskId,
        taskName: taskResult.Item.name,
        assignedTo: taskResult.Item.userId,
        deadline: taskResult.Item.deadline,
        status: 'expired'
      }),
      Subject: `Task Expired Alert: ${taskResult.Item.name}`
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        message: 'Task status updated to expired',
        taskId
      })
    };
  } catch (error) {
    console.error('Update task expired error:', error);
    
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