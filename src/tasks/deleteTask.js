const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

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
          'Content-Type': 'application/json'
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
    
    // Verify user has permission (admin or task owner)
    if (!isAdmin && task.userId !== userId) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'You do not have permission to delete this task' })
      };
    }
    
    // Delete the task
    await dynamodb.delete({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise();
    
    // Send delete message to SQS for any necessary cleanup
    await sqs.sendMessage({
      QueueUrl: process.env.TASK_QUEUE,
      MessageBody: JSON.stringify({ 
        taskId,
        userId: task.userId,
        action: 'DELETE' 
      }),
      MessageGroupId: taskId,
      MessageDeduplicationId: `${taskId}-delete-${Date.now()}`
    }).promise();
    
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