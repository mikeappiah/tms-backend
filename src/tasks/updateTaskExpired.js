const {
  errorResponse,
  successResponse,
  getTask,
  sendNotification
} = require('./utils');

exports.handler = async (event) => {
  try {
    const { taskId } = JSON.parse(event.input || '{}');

    if (!taskId) {
      return errorResponse(400, 'Missing required taskId parameter');
    }

    // Get task details
    const task = await getTask(taskId);
    if (!task) {
      return errorResponse(404, 'Task not found');
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

    // Notify user and admin
    if (task.userId) {
      await sendNotification(
        process.env.TASK_NOTIFICATION_TOPIC,
        {
          message: `Task "${task.name}" has expired! The deadline was ${task.deadline}`,
          taskId,
          taskName: task.name,
          taskDescription: task.description,
          deadline: task.deadline,
          status: 'expired'
        },
        `Task Expired: ${task.name}`,
        { userId: { DataType: 'String', StringValue: task.userId } }
      );
    }

    await sendNotification(
      process.env.ADMIN_NOTIFICATION_TOPIC,
      {
        message: `Task "${task.name}" assigned to user ${task.userId} has expired! The deadline was ${task.deadline}`,
        taskId,
        taskName: task.name,
        assignedTo: task.userId,
        deadline: task.deadline,
        status: 'expired'
      },
      `Task Expired Alert: ${task.name}`
    );

    return successResponse(200, 'Task status updated to expired', { taskId });
  } catch (error) {
    console.error('Update task expired error:', error);
    return errorResponse(500, 'Internal server error', {
      code: error.code || 'InternalServerError'
    });
  }
};