const DynamoService = require('../services/dynamodbService');
const NotificationService = require('../services/notificationService');
const { successResponse, errorResponse } = require('../utils/responseUtils');

exports.handler = async (event) => {
    try {
        const { taskId } = JSON.parse(event.input || '{}');

        if (!taskId) {
            console.error('Missing required taskId parameter');
            return errorResponse(400, 'Missing required taskId parameter');
        }

        // Get task details before updating
        const tasksService = new DynamoService(process.env.TASKS_TABLE);
        const task = await tasksService.getItem({ taskId });

        if (!task) {
            console.error('Task not found:', taskId);
            return errorResponse(404, 'Task not found');
        }

        // Update task status to expired
        await tasksService.updateItem(
            { taskId },
            'SET #status = :status, lastUpdatedAt = :lastUpdatedAt',
            { '#status': 'status' },
            {
                ':status': 'expired',
                ':lastUpdatedAt': new Date().toISOString()
            }
        );

        const notificationService = new NotificationService();

        // Notify both the assigned user and admin about expired task
        if (task.userId) {
            await notificationService.sendSnsNotification(
                process.env.TASK_NOTIFICATION_TOPIC,
                `Task Expired: ${task.name}`,
                {
                    message: `Task "${task.name}" has expired! The deadline was ${task.deadline}`,
                    taskId: taskId,
                    taskName: task.name,
                    taskDescription: task.description,
                    deadline: task.deadline,
                    status: 'expired'
                },
                {
                    userId: { DataType: 'String', StringValue: task.userId }
                }
            );
        }

        // Also notify admin group
        await notificationService.sendSnsNotification(
            process.env.ADMIN_NOTIFICATION_TOPIC,
            `Task Expired Alert: ${task.name}`,
            {
                message: `Task "${task.name}" assigned to user ${task.userId} has expired! The deadline was ${task.deadline}`,
                taskId: taskId,
                taskName: task.name,
                assignedTo: task.userId,
                deadline: task.deadline,
                status: 'expired'
            }
        );

        return successResponse(200, 'Task status updated to expired', { taskId });
    } catch (error) {
        console.error('Update task expired error:', error);
        return errorResponse(500, 'Internal server error', error.code);
    }
};