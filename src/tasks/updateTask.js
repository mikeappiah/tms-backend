const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;

        const userId = claims.sub;
        const taskId = event.pathParameters.taskId;
        const requestBody = JSON.parse(event.body);
        
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
        const userGroups = claims["cognito:groups"];
        const isAdmin = userGroups.includes(process.env.ADMIN_GROUP_NAME);

        // Check task ownership
        const isTaskOwner = taskResult.Item.userId === userId;

        if (!isTaskOwner && !isAdmin) {
            console.log(
                `Authorization failed: Task userId=${taskResult.Item.userId}, Cognito sub=${userId}`
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

        // Determine which fields can be updated based on user role
        if (isAdmin) {
            // Admin can update all fields
            if (requestBody.name !== undefined) {
                updateExpression.push("#name = :name");
                expressionAttributeNames["#name"] = "name";
                expressionAttributeValues[":name"] = requestBody.name;
            }
            
            if (requestBody.status !== undefined) {
                updateExpression.push("#status = :status");
                expressionAttributeNames["#status"] = "status";
                expressionAttributeValues[":status"] = requestBody.status;
                
                if (requestBody.status === "completed") {
                    updateExpression.push("completedAt = :completedAt");
                    expressionAttributeValues[":completedAt"] = new Date().toISOString();
                }
            }
            
            if (requestBody.deadline !== undefined) {
                updateExpression.push("deadline = :deadline");
                expressionAttributeValues[":deadline"] = requestBody.deadline;
            }
            
            if (requestBody.responsibility !== undefined) {
                updateExpression.push("responsibility = :responsibility");
                expressionAttributeValues[":responsibility"] = requestBody.responsibility;
            }
            
            if (requestBody.description !== undefined) {
                updateExpression.push("description = :description");
                expressionAttributeValues[":description"] = requestBody.description;
            }
            
            if (requestBody.userComment !== undefined) {
                updateExpression.push("userComment = :userComment");
                expressionAttributeValues[":userComment"] = requestBody.userComment;
            }

        } else {
            // Regular task owner can only update status and userComment
            if (requestBody.status !== undefined) {
                updateExpression.push("#status = :status");
                expressionAttributeNames["#status"] = "status";
                expressionAttributeValues[":status"] = requestBody.status;
                
                if (requestBody.status === "completed") {
                    updateExpression.push("completedAt = :completedAt");
                    expressionAttributeValues[":completedAt"] = new Date().toISOString();
                }
            }
            
            if (requestBody.userComment !== undefined) {
                updateExpression.push("userComment = :userComment");
                expressionAttributeValues[":userComment"] = requestBody.userComment;
            }
        }

        // Only proceed if there are fields to update
        if (Object.keys(expressionAttributeValues).length <= 1) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: "No valid fields to update" }),
            };
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

        // Fetch user data for the task owner and the user completing the task
        const taskOwnerId = taskResult.Item.userId;
        let taskOwnerUser = null;
        let completingUser = null;

        // Get task owner
        if (taskOwnerId) {
            try {
                const taskOwnerResult = await dynamodb
                    .get({
                        TableName: process.env.USERS_TABLE,
                        Key: { userId: taskOwnerId },
                    })
                    .promise();
                
                if (taskOwnerResult.Item) {
                    taskOwnerUser = taskOwnerResult.Item;
                }
            } catch (err) {
                console.warn("Could not fetch task owner user data:", err);
            }
        }

        // Get data for the user marking the task as completed
        try {
            const completingUserResult = await dynamodb
                .get({
                    TableName: process.env.USERS_TABLE,
                    Key: { userId },
                })
                .promise();
            
            if (completingUserResult.Item) {
                completingUser = completingUserResult.Item;
            }
        } catch (err) {
            console.warn("Could not fetch completing user data:", err);
        }

        // Format deadline date
        const formattedDeadline = taskResult.Item.deadline 
            ? new Date(taskResult.Item.deadline).toLocaleString() 
            : 'No deadline';


        // Create nicely formatted email for task completion
        const taskCompletedEmailContent = `
Dear Admin,

👍 TASK COMPLETED ✅

The following task has been marked as completed!:

COMPLETED TASK DETAILS:
---------------------------------
Task: ${taskResult.Item.name}
Description: ${taskResult.Item.description}
Responsibility: ${taskResult.Item.responsibility}

Assigned To: ${taskOwnerUser.name}
Marked As Completed By: ${completingUser.name}, @ ${new Date().toISOString()}

Supposed Deadline: ${formattedDeadline}
---------------------------------

Thank you!
Task Management System
        `.trim();

        // Notify admin via SNS if task completed
        if (requestBody.status === "completed") {
            try {
                await sns
                    .publish({
                        TopicArn: process.env.TASK_COMPLETE_TOPIC,
                        Message: taskCompletedEmailContent,
                        Subject: `Task Completed: ${taskResult.Item.name}`,
                    })
                    .promise();

                console.log("Completion notification sent for task:", taskId);
            } catch (err) {
                console.error("Failed to send completion notification:", err);
                // Continue processing even if notification fails
            }
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
                updatedFields: isAdmin 
                    ? Object.keys(requestBody).filter(key => requestBody[key] !== undefined)
                    : Object.keys(requestBody).filter(key => ['status', 'userComment'].includes(key) && requestBody[key] !== undefined)
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