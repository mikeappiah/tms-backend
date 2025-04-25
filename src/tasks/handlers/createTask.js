const { generateUUID } = require('../utils/idUtils');
const DynamoService = require('../services/dynamodbService');
const NotificationService = require('../services/notificationService');
const { isAdmin, getUserInfo } = require('../utils/authUtils');
const { successResponse, errorResponse } = require('../utils/responseUtils');
const { validateTaskInput } = require('../utils/validationUtils');

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;
        console.log("CLAIMS OUTPUT: ", claims);

        // Check admin
        if (!isAdmin(claims, process.env.ADMIN_GROUP_NAME)) {
            return errorResponse(403, 'Admin access required');
        }

        const requestBody = JSON.parse(event.body);

        // Validate inputs
        const validation = validateTaskInput(requestBody);
        if (!validation.isValid) {
            return errorResponse(400, validation.error);
        }

        const { userId, name, description, responsibility, deadline } = requestBody;

        // Generate task ID
        const taskId = generateUUID();

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
        const tasksService = new DynamoService(process.env.TASKS_TABLE);
        await tasksService.putItem(task);

        // Queueing task for processing
        const notificationService = new NotificationService();
        await notificationService.sendTaskQueue(
            process.env.TASK_QUEUE,
            {
                taskId,
                userId,
                action: 'CREATE'
            },
            taskId,
            `${taskId}-${Date.now()}`
        );

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
        return errorResponse(500, 'Internal server error', error.code);
    }
};