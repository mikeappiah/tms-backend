const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        const { taskId } = JSON.parse(event.input || "{}");

        if (!taskId) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.MISSING_TASKID }),
            };
        }

        const taskResult = await dynamodb
            .get({
                TableName: process.env.TASKS_TABLE,
                Key: { taskId },
            })
            .promise();

        if (!taskResult.Item) {
            console.error("Task not found:", taskId);
            return {
                statusCode: COMMON.STATUS_CODES.NOT_FOUND,
                headers: {
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.TASK_NOT_FOUND }),
            };
        }

        // Update task status to expired
        await dynamodb
            .update({
                TableName: process.env.TASKS_TABLE,
                Key: { taskId },
                UpdateExpression: "SET #status = :status, lastUpdatedAt = :lastUpdatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":status": "expired",
                    ":lastUpdatedAt": new Date().toISOString(),
                },
            })
            .promise();

        // Notify both the assigned user and admin about expired task
        if (taskResult.Item.userId) {
            await sns
                .publish({
                    TopicArn: process.env.TASK_NOTIFICATION_TOPIC,
                    Message: JSON.stringify({
                        message: `Task "${taskResult.Item.name}" has expired! The deadline was ${taskResult.Item.deadline}`,
                        taskId: taskId,
                        taskName: taskResult.Item.name,
                        taskDescription: taskResult.Item.description,
                        deadline: taskResult.Item.deadline,
                        status: "expired",
                    }),
                    Subject: `Task Expired: ${taskResult.Item.name}`,
                    MessageAttributes: {
                        userId: { DataType: "String", StringValue: taskResult.Item.userId },
                    },
                })
                .promise();
        }

        // Also notify admin group
        await sns
            .publish({
                TopicArn: process.env.ADMIN_NOTIFICATION_TOPIC,
                Message: JSON.stringify({
                    message: `Task "${taskResult.Item.name}" assigned to user ${taskResult.Item.userId} has expired! The deadline was ${taskResult.Item.deadline}`,
                    taskId: taskId,
                    taskName: taskResult.Item.name,
                    assignedTo: taskResult.Item.userId,
                    deadline: taskResult.Item.deadline,
                    status: "expired",
                }),
                Subject: `Task Expired Alert: ${taskResult.Item.name}`,
            })
            .promise();

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify({
                message: COMMON.SUCCESS_MSG.TASK_SET_TO_EXPIRED,
                taskId,
            }),
        };
    } catch (error) {
        console.error("Update task expired error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify({
                error: "Internal server error",
                code: error.code || COMMON.ERROR.INTERNAL_SERVER_ERROR,
            }),
        };
    }
};
