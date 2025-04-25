const DynamoService = require('../services/dynamodbService');
const NotificationService = require('../services/notificationService');
const { isAdmin, getUserInfo } = require('../utils/authUtils');
const { successResponse, errorResponse } = require('../utils/responseUtils');

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;
        console.log("CLAIMS OUTPUT: ", claims);

        const { username } = getUserInfo(claims);

        // Check admin authorization
        if (!isAdmin(claims, process.env.ADMIN_GROUP_NAME)) {
            console.log(`Authorization failed: User ${username} is not an admin`);
            return errorResponse(403, 'Admin access required');
        }

        const taskId = event.pathParameters.taskId;
        const requestBody = JSON.parse(event.body);
        const { userId, username: assignedUsername } = requestBody;

        // Validate required fields
        if (!taskId) {
            return errorResponse(400, 'taskId is required');
        }

        if (!userId && !assignedUsername) {
            return errorResponse(400, 'userId or username is required');
        }

        const effectiveUserId = userId || assignedUsername;

        // Verify task exists
        const tasksService = new DynamoService(process.env.TASKS_TABLE);
        const task = await tasksService.getItem({ taskId });

        if (!task) {
            return errorResponse(404, 'Task not found');
        }

        console.log(`Task found: ${taskId}, current status: ${task.status}`);

        // Update task
        const updateResult = await tasksService.updateItem(
            { taskId },
            'SET #status = :status, userId = :userId, completedAt = :completedAt, lastUpdatedAt = :lastUpdatedAt, adminComment = :adminComment',
            { '#status': 'status' },
            {
                ':status': 'open',
                ':userId': effectiveUserId,
                ':completedAt': null,
                ':lastUpdatedAt': new Date().toISOString(),
                ':adminComment': requestBody.adminComment || ''
            }
        );

        console.log(`Task reopened successfully: ${taskId}, assigned to: ${effectiveUserId}`);

        // Prepare user display name for notifications
        const userDisplayName = assignedUsername || userId;

        // Notify the assigned user via SNS
        const notificationService = new NotificationService();
        await notificationService.sendSnsNotification(
            process.env.TASK_ASSIGNMENT_TOPIC,
            `Task Reopened: ${task.name}`,
            {
                message: `A task ${task.name} has been reopened and assigned to you`,
                taskId: taskId,
                taskName: task.name,
                taskDescription: task.description,
                deadline: task.deadline,
                reopenedBy: username,
                reopenedAt: new Date().toISOString(),
                adminComment: requestBody.adminComment || ''
            },
            {
                userId: { DataType: 'String', StringValue: effectiveUserId }
            }
        );

        console.log("Reopening notification sent for task:", taskId);

        return successResponse(200, 'Task reopened successfully', { taskId, userId: effectiveUserId });
    } catch (error) {
        console.error('Reopen task error:', error);
        return errorResponse(500, 'Internal server error', error.code);
    }
};
