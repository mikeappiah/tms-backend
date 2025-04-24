const {
  errorResponse,
  successResponse,
  isAdmin,
  getUsername,
  getTask,
  sendNotification
} = require('./utils');

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;

    // Check admin authorization
    if (!isAdmin(claims)) {
      return errorResponse(403, 'Admin access required');
    }

    const taskId = event.pathParameters.taskId;
    const { userId, username, adminComment } = JSON.parse(event.body);

    // Validate required fields
    if (!taskId) {
      return errorResponse(400, 'taskId is required');
    }

    if (!userId && !username) {
      return errorResponse(400, 'userId or username is required');
    }

    const effectiveUserId = userId || username;
    const adminUsername = getUsername(claims);

    // Verify task exists
    const task = await getTask(taskId);
    if (!task) {
      return errorResponse(404, 'Task not found');
    }

    // Update task
    await dynamodb.update({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: 'SET #status = :status, userId = :userId, completedAt = :completedAt, lastUpdatedAt = :lastUpdatedAt, adminComment = :adminComment',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'open',
        ':userId': effectiveUserId,
        ':completedAt': null,
        ':lastUpdatedAt': new Date().toISOString(),
        ':adminComment': adminComment || ''
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    // Notify the assigned user
    await sendNotification(
      process.env.TASK_ASSIGNMENT_TOPIC,
      {
        message: `A task ${task.name} has been reopened and assigned to you`,
        taskId,
        taskName: task.name,
        taskDescription: task.description,
        deadline: task.deadline,
        reopenedBy: adminUsername,
        reopenedAt: new Date().toISOString(),
        adminComment: adminComment || ''
      },
      `Task Reopened: ${task.name}`,
      { userId: { DataType: 'String', StringValue: effectiveUserId } }
    );

    return successResponse(200, 'Task reopened successfully', {
      taskId,
      userId: effectiveUserId
    });
  } catch (error) {
    console.error('Reopen task error:', error);
    return errorResponse(500, 'Internal server error', {
      code: error.code || 'InternalServerError',
      message: error.message
    });
  }
};