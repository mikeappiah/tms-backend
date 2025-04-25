const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sfn = new AWS.StepFunctions();

// Common response headers
const commonHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
};

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

    // Check admin status
    isAdmin: (claims) => {
        const userGroups = claims['cognito:groups'] || [];
        return userGroups.includes(process.env.ADMIN_GROUP_NAME);
    },

    // Generate secure password (meets Cognito requirements)
    generateSecurePassword: () => {
        const special = '!@#$%^&*()_+=-';
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';

        let password = '';
        password += special.charAt(Math.floor(Math.random() * special.length));
        password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
        password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
        password += numbers.charAt(Math.floor(Math.random() * numbers.length));

        const allChars = special + lowercase + uppercase + numbers;
        for (let i = 0; i < 8; i++) {
            password += allChars.charAt(Math.floor(Math.random() * allChars.length));
        }

        return password.split('').sort(() => 0.5 - Math.random()).join('');
    },

    // Create user in Cognito
    createCognitoUser: async (email, tempPassword) => {
        return await cognito.adminCreateUser({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: email,
            TemporaryPassword: tempPassword,
            UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'email_verified', Value: 'true' }
            ]
        }).promise();
    },

    // Add user to Cognito group
    addUserToGroup: async (email, role) => {
        const groupName = role === 'admin' ?
            process.env.ADMIN_GROUP_NAME :
            process.env.MEMBER_GROUP_NAME;

        return await cognito.adminAddUserToGroup({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: email,
            GroupName: groupName
        }).promise();
    },

    // Create user record in DynamoDB
    createUserRecord: async (userData, createdBy) => {
        return await dynamodb.put({
            TableName: process.env.USERS_TABLE,
            Item: {
                userId: userData.User.Username,
                email: userData.User.Attributes.find(attr => attr.Name === 'email').Value,
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                role: userData.role,
                createdAt: new Date().toISOString(),
                createdBy,
                status: 'FORCE_CHANGE_PASSWORD'
            }
        }).promise();
    },

    // Start Step Function for user setup
    startUserSetupWorkflow: async (userId, email) => {
        return await sfn.startExecution({
            stateMachineArn: process.env.SUBSCRIBE_USER_STATE_MACHINE_ARN,
            input: JSON.stringify({ userId, email })
        }).promise();
    },

    // Get paginated users from DynamoDB
    getPaginatedUsers: async (limit, lastEvaluatedKey) => {
        const params = {
            TableName: process.env.USERS_TABLE,
            Limit: limit
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        return await dynamodb.scan(params).promise();
    },

    // Parse pagination token
    parsePaginationToken: (token) => {
        return token ?
            JSON.parse(Buffer.from(token, 'base64').toString()) :
            undefined;
    },

    // Format pagination response
    formatPaginationResponse: (result) => {
        const response = {
            users: result.Items,
            count: result.Count
        };

        if (result.LastEvaluatedKey) {
            response.nextToken = Buffer.from(
                JSON.stringify(result.LastEvaluatedKey)
            ).toString('base64');
        }

        return response;
    }
};