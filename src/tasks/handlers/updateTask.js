const DynamoService = require('../services/dynamodbService');
const NotificationService = require('../services/notificationService');
const { isAdmin, getUserInfo, isTaskOwner } = require('../utils/authUtils');
const { successResponse, errorResponse } = require('../utils/responseUtils');

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;
        console.log("CLAIMS OUTPUT: ", claims);

        const { userId, username } = getUserInfo(claims);
        const taskId = event.pathParameters.taskId;
        const { status, userComment } = JSON.parse(event.body);

        if (!taskId) {
            return errorResponse(400, 'taskId is required');
        }

        const tasksService = new DynamoService(process.env.TASKS_TABLE);
        const task = await tasksService.getItem({ taskId });

        if (!task) {
            return errorResponse(404, 'Task not found');
        }

        const isAdminUser = isAdmin(claims, process.env.ADMIN_GROUP_NAME);
        const ownsTask = isTaskOwner(task, userId, username);

        if (!ownsTask && !isAdminUser) {
            console.log(`Authorization failed: Task userId=${task.userId}, Cognito sub=${userId}, username=${username}`);
            return errorResponse(403, 'Not authorized to update this task');
        }

        // 👉 Role-based update permission checks
        if (isAdminUser) {
            if (userComment !== undefined) {
                return errorResponse(403, 'Admins are not allowed to update userComment');
            }
        } else {
            // User (non-admin)
            if (status === undefined && userComment === undefined) {
                return errorResponse(400, 'Users can only update status or userComment');
            }
        }

        // Prepare update expression
        const updateExpression = ['SET lastUpdatedAt = :updatedAt'];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {
            ':updatedAt': new Date().toISOString()
        };

        if (status) {
            updateExpression.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = status;

            if (status === 'completed') {
                updateExpression.push('completedAt = :completedAt');
                expressionAttributeValues[':completedAt'] = new Date().toISOString();
            }
        }

        if (!isAdminUser && userComment !== undefined) {
            // Only allow userComment update if NOT admin
            updateExpression.push('userComment = :userComment');
            expressionAttributeValues[':userComment'] = userComment;
        }

        // Update task in DynamoDB
        const updatedTask = await tasksService.updateItem(
            { taskId },
            updateExpression.join(', '),
            expressionAttributeNames,
            expressionAttributeValues
        );

        console.log("Task updated successfully:", taskId);

        if (status === 'completed') {
            const completedBy = task.userId;
            const displayName = username || userId;

            const notificationService = new NotificationService();
            await notificationService.sendSnsNotification(
                process.env.TASK_COMPLETE_TOPIC,
                `Task Completed: ${task.name}`,
                {
                    message: `Task "${task.name}" marked as completed by user ${displayName}`,
                    taskId: taskId,
                    taskName: task.name,
                    completedBy: completedBy,
                    userDisplayName: displayName,
                    completedAt: new Date().toISOString()
                }
            );

            console.log("Completion notification sent for task:", taskId);
        }

        return successResponse(200, 'Task updated successfully', { taskId });
    } catch (error) {
        console.error('Update task error:', error);
        return errorResponse(500, 'Internal server error', error.code);
    }
};
