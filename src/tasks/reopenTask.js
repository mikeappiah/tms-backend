const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;

        //const adminUserId = claims.sub;
        const adminUsername = claims["cognito:username"] || claims.email || claims.sub;

        // Check admin authorization
        const userGroups = claims["cognito:groups"] || [];
        if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
            console.log(`Authorization failed: User ${adminUsername} is not an admin`);
            return {
                statusCode: COMMON.STATUS_CODES.FORBIDDEN,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json'
                  },
                body: JSON.stringify({ error: COMMON.ERROR.ADMIN_ACCESS_REQUIRED }),
            };
        }

        const taskId = event.pathParameters.taskId;
        const requestBody = JSON.parse(event.body);
        const { userId, deadline } = requestBody;

        // Validate required fields
        if (!taskId) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json'
                  },
                body: JSON.stringify({ error: COMMON.ERROR.TASK_ID_REQUIRED }),
            };
        }

        if (!userId) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json'
                  },
                body: JSON.stringify({ error: 'userId required' }),
            };
        }

        const effectiveUserId = userId;

        // Verify task's existence
        const taskResult = await dynamodb
            .get({
                TableName: process.env.TASKS_TABLE,
                Key: { taskId },
            })
            .promise();

        if (!taskResult.Item) {
            return {
                statusCode: COMMON.STATUS_CODES.NOT_FOUND,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json'
                  },
                body: JSON.stringify({ error: COMMON.ERROR.TASK_NOT_FOUND }),
            };
        }

        console.log(`Task found: ${taskId}, current status: ${taskResult.Item.status}`);


        let taskOwnerUser = null

        // Get task owner
        if (effectiveUserId) {
            try {
                const taskOwnerResult = await dynamodb
                    .get({
                        TableName: process.env.USERS_TABLE,
                        Key: { userId: effectiveUserId },
                    })
                    .promise();
                
                if (taskOwnerResult.Item) {
                    taskOwnerUser = taskOwnerResult.Item;
                }
            } catch (err) {
                console.warn("Could not fetch task owner user data:", err);
            }
        }


        //task owner object
        const taskOwner = {
            userId: taskOwnerUser.userId,
            name: taskOwnerUser.name,
            email: taskOwnerUser.email
          }

        // Update task
        const updateResult = await dynamodb
            .update({
                TableName: process.env.TASKS_TABLE,
                Key: { taskId },
                UpdateExpression:
                    "SET #status = :status, userId = :userId, completedAt = :completedAt, lastUpdatedAt = :lastUpdatedAt, deadline = :deadline, taskOwner = :taskOwner",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":status": "open",
                    ":userId": effectiveUserId,
                    ":completedAt": null,
                    ":lastUpdatedAt": new Date().toISOString(),
                    ":deadline": deadline,
                    ":taskOwner": taskOwner
                },
                ReturnValues: "ALL_NEW",
            })
            .promise();

        console.log(`Task reopened successfully: ${taskId}, assigned to: ${effectiveUserId}`);


        // Format deadline date
        const formattedDeadline = taskResult.Item.deadline 
            ? new Date(taskResult.Item.deadline).toLocaleString() 
            : new Date(deadline).toLocaleString() ;

        // Create nicely formatted email for task completion
        const taskReopenEmailContent = `
Dear ${taskOwnerUser.name},

⚠️ TASK RE-ASSIGNED 📌

The following task has been reopened and assigned to you!:

REOPENED/RE-ASSIGNED TASK DETAILS:
---------------------------------
Task: ${taskResult.Item.name}
Description: ${taskResult.Item.description}
Responsibility: ${taskResult.Item.responsibility}

Deadline: ${formattedDeadline}
---------------------------------

Thank you!
Task Management System
        `.trim();

        // Notify the assigned user via SNS
        await sns
            .publish({
                TopicArn: process.env.TASK_ASSIGNMENT_TOPIC,
                Message: taskReopenEmailContent,
                Subject: `REOPENED: Task reassigned - ${taskResult.Item.name}`,
                MessageAttributes: {
                  email: { DataType: 'String', StringValue: taskOwnerUser.email },
                  userId: { DataType: 'String', StringValue: effectiveUserId }
                },
            })
            .promise();

        console.log("Reopening notification sent for task:", taskId);

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json'
              },
            body: JSON.stringify({
                message: COMMON.SUCCESS_MSG.TASK_OPENED,
                taskId,
                userId: effectiveUserId,
            }),
        };
    } catch (error) {
        console.error("Reopen task error:", error);

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
                error: "Internal server error",
                message: error.message,
            }),
        };
    }
};
