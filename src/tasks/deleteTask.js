const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    const userGroups = claims['cognito:groups'] || [];
    const isAdmin = userGroups.includes(process.env.ADMIN_GROUP_NAME);
    const userId = claims.sub;
    
    // Extract taskId from path parameters
    const { taskId } = event.pathParameters;
    
    if (!taskId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
          'Access-Control-Allow-Methods': 'POST, DELETE, GET, OPTIONS, PUT',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({ error: 'Task ID is required' })
      };
    }
    
    // First get the task to verify ownership or admin rights
    const taskResponse = await dynamodb.get({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise();
    
    const task = taskResponse.Item;
    
    if (!task) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Task not found' })
      };
    }
    
    // Verify user has permission (admin)
    if (!isAdmin) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'You do not have permission to delete this task' })
      };
    }
    
    // Get user details from USERS_TABLE
    const userResponse = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { userId: task.userId }
    }).promise();
    
    const user = userResponse.Item;
    
    if (!user) {
      console.error('User not found for task:', task);
    }

    // Format deadline date
    const formattedDeadline = task.deadline ? new Date(task.deadline).toLocaleString() : 'No deadline';
    
    // Delete the task
    await dynamodb.delete({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise();
    
    // Create nicely formatted email for task deletion
    const taskDeleteEmailContent = `
Dear ${user ? user.name : 'User'},

🚫 TASK DELETED ❌

The following task previously assigned to you has been deleted:

DELETED TASK DETAILS:
---------------------------------
Task: ${task.name}
Description: ${task.description}
Supposed Deadline: ${formattedDeadline}
---------------------------------

You no more have access to this task.

Thank you,
Task Management System
    `.trim();

    // Send only the formatted email content to SNS (not the JSON)
    if (user && user.email) {
      await sns.publish({
        TopicArn: process.env.TASK_DELETE_TOPIC,
        Message: taskDeleteEmailContent,
        Subject: `DELETED: Task removed - ${task.name}`,
        MessageAttributes: {
          email: { DataType: 'String', StringValue: user.email },
          userId: { DataType: 'String', StringValue: user.userId }
        }
      }).promise();
    } else {
      console.warn('Could not send deletion notification - user details not found');
    }
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Task deleted successfully',
        taskId
      })
    };
    
  } catch (error) {
    console.error('Delete task error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        code: error.code || 'InternalServerError',
        message: error.message
      })
    };
  }
};