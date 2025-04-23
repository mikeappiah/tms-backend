const {
  errorResponse,
  successResponse,
  isValidISODate,
  isAdmin,
  createTaskObject,
  sendNotification
} = require('./utils');

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;

    // Check admin
    if (!isAdmin(claims)) {
      return errorResponse(403, 'Admin access required');
    }

    const body = JSON.parse(event.body);
    const { userId, name, description, responsibility, deadline } = body;

    // Validate inputs
    if (!name || !description || !responsibility || !deadline || !userId) {
      return errorResponse(400, 'Missing required fields');
    }

    // Validate deadline format
    if (!isValidISODate(deadline)) {
      return errorResponse(400, 'Invalid deadline format. Use ISO date format.');
    }

    // Generate task ID and create task
    const taskId = uuidv4();
    const task = createTaskObject(taskId, userId, body, claims);

    // Store in DynamoDB
    await dynamodb.put({
      TableName: process.env.TASKS_TABLE,
      Item: task
    }).promise();

    // Queue task for processing
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

    return successResponse(201, 'Task created successfully', {
      task: {
        taskId,
        userId,
        name,
        description,
        responsibility,
        status: 'open',
        deadline,
      }
    });
  } catch (error) {
    console.error('Create task error:', error);
    return errorResponse(500, 'Internal server error', {
      code: error.code || 'InternalServerError'
    });
  }
};