const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    
    const claims = event.requestContext.authorizer.claims;
    console.log("CLAIMS OUTPUT: ", claims);
    
    // Check admin
    const userGroups = claims['cognito:groups'] || [];
    if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
          'Access-Control-Allow-Credentials': true,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { userId, name, description, responsibility, deadline } = JSON.parse(event.body);
    
    // Validate inputs
    if (!name || !description || !responsibility || !deadline || !userId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Validate deadline format (ISO string)
    if (!isValidISODate(deadline)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
          'Access-Control-Allow-Credentials': true,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid deadline format. Use ISO date format.' })
      };
    }

    // Generate task ID
    const taskId = uuidv4();
    
    // Create task object
    const task = {
      taskId,
      userId,
      name,
      description,
      responsibility,
      status: 'open',
      userComment: '',
      deadline,
      completedAt: null,
      createdBy: claims.sub,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };

    // Store in TasksTable
    await dynamodb.put({
      TableName: process.env.TASKS_TABLE,
      Item: task
    }).promise();

    // Queueing task for processing
    await sqs.sendMessage({
      QueueUrl: process.env.TASK_QUEUE,
      MessageBody: JSON.stringify({ 
        taskId, 
        userId,
        action: 'CREATE' 
      }),
      MessageGroupId: taskId,
      MessageDeduplicationId: `${taskId}-${Date.now()}`
    }).promise();

    return {
      statusCode: 201,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
        'Access-Control-Allow-Credentials': true,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        message: 'Task created successfully',
        task: {
          taskId,
          userId,
          name,
          description,
          responsibility,
          status: 'open',
          deadline,
        }
      })
    };
  } catch (error) {
    console.error('Create task error:', error);
    
    // Error handling
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
        'Access-Control-Allow-Credentials': true,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        code: error.code || 'InternalServerError'
      })
    };
  }
};


function isValidISODate(dateString) {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  if (!isoRegex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}