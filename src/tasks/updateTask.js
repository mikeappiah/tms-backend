const {
  errorResponse,
  successResponse,
  getTask,
  validateTaskOwnership,
  getUsername,
  sendNotification
} = require('./utils');

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    const taskId = event.pathParameters.taskId;
    const { status, userComment } = JSON.parse(event.body);

    if (!taskId) {
      return errorResponse(400, 'taskId is required');
    }

    // Get task and validate ownership
    const task = await getTask(taskId);
    if (!task) {
      return errorResponse(404, 'Task not found');
    }

    if (!validateTaskOwnership(task, claims)) {
      return errorResponse(403, 'Not authorized to update this task');
    }

    // Prepare update
    const updateParams = {
      TableName: process.env.TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: 'SET lastUpdatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    if (status) {
      updateParams.UpdateExpression += ', #status = :status';
      updateParams.ExpressionAttributeNames = { '#status': 'status' };
      updateParams.ExpressionAttributeValues[':status'] = status;

      if (status === 'completed') {
        updateParams.UpdateExpression += ', completedAt = :completedAt';
        updateParams.ExpressionAttributeValues[':completedAt'] = new Date().toISOString();
      }
    }

    if (userComment !== undefined) {
      updateParams.UpdateExpression += ', userComment = :userComment';
      updateParams.ExpressionAttributeValues[':userComment'] = userComment;
    }

    // Update task
    await dynamodb.update(updateParams).promise();

    // Notify if completed
    if (status === 'completed') {
      const displayName = getUsername(claims);
      await sendNotification(
        process.env.TASK_COMPLETE_TOPIC,
        {
          message: `Task "${task.name}" marked as completed by user ${displayName}`,
          taskId,
          taskName: task.name,
          completedBy: task.userId,
          userDisplayName: displayName,
          completedAt: new Date().toISOString()
        },
        `Task Completed: ${task.name}`
      );
    }

    return successResponse(200, 'Task updated successfully', { taskId });
  } catch (error) {
    console.error('Update task error:', error);
    return errorResponse(500, 'Internal server error', {
      code: error.code || 'InternalServerError',
      message: error.message
    });
  }
};