const DynamoService = require('../services/dynamodbService');
const { isAdmin, getUserInfo } = require('../utils/authUtils');
const { successResponse, errorResponse } = require('../utils/responseUtils');

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;
        console.log("CLAIMS OUTPUT: ", claims);

        const { userId, username } = getUserInfo(claims);

        // Check if admin
        const isAdminUser = isAdmin(claims, process.env.ADMIN_GROUP_NAME);

        const tasksService = new DynamoService(process.env.TASKS_TABLE);
        let tasks = [];

        // Admin can see all tasks
        if (isAdminUser) {
            console.log("Admin user - retrieving all tasks");
            tasks = await tasksService.scan();
        } else {
            // Regular users can only see their assigned tasks
            console.log(`Regular user - fetching tasks for userId: ${userId} and username: ${username}`);

            // Try to find tasks by Cognito sub ID
            let subIdTasks = await tasksService.scan('userId = :uid', { ':uid': userId });

            // If no results, try by username
            if (!subIdTasks || subIdTasks.length === 0) {
                console.log(`No tasks found with Cognito ID, trying with username: ${username}`);

                const usernameTasks = await tasksService.scan('userId = :username', { ':username': username });

                if (usernameTasks && usernameTasks.length > 0) {
                    console.log(`Found ${usernameTasks.length} tasks using username`);
                    tasks = usernameTasks;
                } else {
                    // If still no results, just return empty array
                    console.log("No tasks found for user");
                    tasks = [];
                }
            } else {
                tasks = subIdTasks;
            }

            console.log(`Found ${tasks.length} tasks for user`);
        }

        return successResponse(200, 'Tasks retrieved successfully', { tasks });
    } catch (error) {
        console.error('List tasks error:', error);
        return errorResponse(500, 'Internal server error', error.code);
    }
};