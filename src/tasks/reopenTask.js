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
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.ADMIN_ACCESS_REQUIRED }),
            };
        }

        const taskId = event.pathParameters.taskId;
        const requestBody = JSON.parse(event.body);
        const { userId, username } = requestBody;

        // Validate required fields
        if (!taskId) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.TASK_ID_REQUIRED }),
            };
        }

        if (!userId && !username) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.USERID_OR_USERNAME_REQUIRED }),
            };
        }

        const effectiveUserId = userId || username;

        // Verify task exists
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
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.TASK_NOT_FOUND }),
            };
        }

        console.log(`Task found: ${taskId}, current status: ${taskResult.Item.status}`);

        // Update task
        const updateResult = await dynamodb
            .update({
                TableName: process.env.TASKS_TABLE,
                Key: { taskId },
                UpdateExpression:
                    "SET #status = :status, userId = :userId, completedAt = :completedAt, lastUpdatedAt = :lastUpdatedAt, adminComment = :adminComment",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":status": "open",
                    ":userId": effectiveUserId,
                    ":completedAt": null,
                    ":lastUpdatedAt": new Date().toISOString(),
                    ":adminComment": requestBody.adminComment || "",
                },
                ReturnValues: "ALL_NEW",
            })
            .promise();

        console.log(`Task reopened successfully: ${taskId}, assigned to: ${effectiveUserId}`);

        // Prepare user display name for notifications
        const userDisplayName = username || userId;

        // Notify the assigned user via SNS
        await sns
            .publish({
                TopicArn: process.env.TASK_ASSIGNMENT_TOPIC,
                Message: JSON.stringify({
                    message: `A task ${taskResult.Item.name} has been reopened and assigned to you`,
                    taskId: taskId,
                    taskName: taskResult.Item.name,
                    taskDescription: taskResult.Item.description,
                    deadline: taskResult.Item.deadline,
                    reopenedBy: adminUsername,
                    reopenedAt: new Date().toISOString(),
                    adminComment: requestBody.adminComment || "", // Just there for in case
                }),
                Subject: `Task Reopened: ${taskResult.Item.name}`,
                MessageAttributes: {
                    userId: { DataType: "String", StringValue: effectiveUserId },
                },
            })
            .promise();

        console.log("Reopening notification sent for task:", taskId);

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
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
                "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify({
                error: "Internal server error",
                message: error.message,
            }),
        };
    }
};
