const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;

        const userId = claims.sub;
        const username = claims["cognito:username"] || claims.email || claims.sub;
        const taskId = event.pathParameters.taskId;
        const { status, userComment } = JSON.parse(event.body);

        // Validate required fields
        if (!taskId) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.MISSING_TASKID }),
            };
        }

        // Fetch task
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

        // Check authorization - user must own the task or be an admin
        const userGroups = claims["cognito:groups"] || [];
        const isAdmin = userGroups.includes(process.env.ADMIN_GROUP_NAME);

        // Check task ownership against both userId formats
        const isTaskOwner = taskResult.Item.userId === userId || taskResult.Item.userId === username;

        if (!isTaskOwner && !isAdmin) {
            console.log(
                `Authorization failed: Task userId=${taskResult.Item.userId}, Cognito sub=${userId}, username=${username}`
            );
            return {
                statusCode: COMMON.STATUS_CODES.FORBIDDEN,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.NOT_AUTHORIZED_TO_UPDATE }),
            };
        }

        // Prepare update expression
        const updateExpression = ["SET lastUpdatedAt = :updatedAt"];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {
            ":updatedAt": new Date().toISOString(),
        };

        if (status) {
            updateExpression.push("#status = :status");
            expressionAttributeNames["#status"] = "status";
            expressionAttributeValues[":status"] = status;

            if (status === "completed") {
                updateExpression.push("completedAt = :completedAt");
                expressionAttributeValues[":completedAt"] = new Date().toISOString();
            }
        }

        if (userComment !== undefined) {
            updateExpression.push("userComment = :userComment");
            expressionAttributeValues[":userComment"] = userComment;
        }

        // Update task in DynamoDB
        const updatedTask = await dynamodb
            .update({
                TableName: process.env.TASKS_TABLE,
                Key: { taskId },
                UpdateExpression: updateExpression.join(", "),
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: "ALL_NEW",
            })
            .promise();

        console.log("Task updated successfully:", taskId);

        // Notify admin via SNS if task completed
        if (status === "completed") {
            // Use the stored userId from the task for notification purposes
            const completedBy = taskResult.Item.userId;
            const displayName = username || userId;

            await sns
                .publish({
                    TopicArn: process.env.TASK_COMPLETE_TOPIC,
                    Message: JSON.stringify({
                        message: `Task "${taskResult.Item.name}" marked as completed by user ${displayName}`,
                        taskId: taskId,
                        taskName: taskResult.Item.name,
                        completedBy: completedBy,
                        userDisplayName: displayName,
                        completedAt: new Date().toISOString(),
                    }),
                    Subject: `Task Completed: ${taskResult.Item.name}`,
                })
                .promise();

            console.log("Completion notification sent for task:", taskId);
        }

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: "Task updated successfully",
                taskId,
            }),
        };
    } catch (error) {
        console.error("Update task error:", error);

        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                error: "Internal server error",
                code: error.code || "InternalServerError",
                message: error.message,
            }),
        };
    }
};
