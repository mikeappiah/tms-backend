const AWS = require("aws-sdk");
const COMMON = require("../../utils/constants");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        // Extract taskId and userId from the event object
        let taskId, userId;

        if (typeof event === "object") {
            if (event.taskId && event.userId) {
                taskId = event.taskId;
                userId = event.userId;
            } else if (event.input && typeof event.input === "string") {
                const parsed = JSON.parse(event.input);
                taskId = parsed.taskId;
                userId = parsed.userId;
            } else if (event.body && typeof event.body === "string") {
                const parsed = JSON.parse(event.body);
                taskId = parsed.taskId;
                userId = parsed.userId;
            }
        }

        // Check if required data was found
        if (!(taskId && userId)) {
            throw new Error("Both taskId and userId are required");
        }

        // Fetch task and user
        const taskResult = await dynamodb
            .get({
                TableName: process.env.TASKS_TABLE,
                Key: { taskId },
            })
            .promise();

        const userResult = await dynamodb
            .get({
                TableName: process.env.USERS_TABLE,
                Key: { userId },
            })
            .promise();

        if (!taskResult.Item) {
            throw new Error(`Task with ID ${taskId} not found`);
        }

        if (!userResult.Item) {
            throw new Error(`User with ID ${userId} not found`);
        }

        const task = taskResult.Item;
        const user = userResult.Item;

        // Notify assigned user
        await sns
            .publish({
                TopicArn: process.env.CLOSED_TASK_TOPIC,
                Message: `Task "${task.name}" has expired.`,
                MessageAttributes: {
                    email: { DataType: "String", StringValue: user.email },
                },
            })
            .promise();

        // Notify admins
        const adminResult = await dynamodb
            .scan({
                TableName: process.env.USERS_TABLE,
                FilterExpression: "#role = :role",
                ExpressionAttributeNames: { "#role": "role" },
                ExpressionAttributeValues: { ":role": "admin" },
            })
            .promise();

        for (const admin of adminResult.Items) {
            await sns
                .publish({
                    TopicArn: process.env.CLOSED_TASK_TOPIC,
                    Message: `Task "${task.name}" assigned to ${user.email} has expired.`,
                    MessageAttributes: {
                        email: { DataType: "String", StringValue: admin.email },
                    },
                })
                .promise();
        }

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            body: JSON.stringify({
                message: "Notifications sent for expired task",
                task: task.name,
                user: user.email,
                adminCount: adminResult.Items.length,
            }),
        };
    } catch (error) {
        console.error("Error sending notifications:", error);

        return {
            statusCode: error.statusCode || COMMON.STATUS_CODES.INTERNAL_SERVER_ERROR,
            body: JSON.stringify({
                error: error.message || COMMON.ERROR.FAILED_TO_SEND_NOTIFICATION,
                details: error.code ? `AWS Error Code: ${error.code}` : undefined,
            }),
        };
    }
};
