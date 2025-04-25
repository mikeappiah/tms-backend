const AWS = require('aws-sdk');

// Initialize AWS SDK clients
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const sns = new AWS.SNS();
const cognito = new AWS.CognitoIdentityServiceProvider();

// Common response headers
const commonHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
};

// Utility functions
module.exports = {
    // Common error response
    errorResponse: (statusCode, error, details = {}) => ({
        statusCode,
        headers: commonHeaders,
        body: JSON.stringify({ error, ...details })
    }),

    // Success response
    successResponse: (statusCode, message, data = {}) => ({
        statusCode,
        headers: commonHeaders,
        body: JSON.stringify({ message, ...data })
    }),

    // Validate ISO date
    isValidISODate: (dateString) => {
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
        if (!isoRegex.test(dateString)) return false;
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date.getTime());
    },

    // Check admin status
    isAdmin: (claims) => {
        const userGroups = claims['cognito:groups'] || [];
        return userGroups.includes(process.env.ADMIN_GROUP_NAME);
    },

    // Get username from claims
    getUsername: (claims) => claims['cognito:username'] || claims.email || claims.sub,

    // Get task by ID
    getTask: async (taskId) => {
        const result = await dynamodb.get({
            TableName: process.env.TASKS_TABLE,
            Key: { taskId }
        }).promise();
        return result.Item;
    },

    // Validate task ownership
    validateTaskOwnership: (task, claims) => {
        const userId = claims.sub;
        const username = module.exports.getUsername(claims);
        const isAdmin = module.exports.isAdmin(claims);

        return isAdmin || task.userId === userId || task.userId === username;
    },

    // Send SNS notification
    sendNotification: async (topicArn, message, subject, messageAttributes = {}) => {
        await sns.publish({
            TopicArn: topicArn,
            Message: JSON.stringify(message),
            Subject: subject,
            MessageAttributes: messageAttributes
        }).promise();
    },

    // Common task fields for creation
    createTaskObject: (taskId, userId, body, claims) => ({
        taskId,
        userId,
        name: body.name,
        description: body.description,
        responsibility: body.responsibility,
        status: 'open',
        userComment: '',
        deadline: body.deadline,
        completedAt: null,
        createdBy: claims.sub,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
    })
};