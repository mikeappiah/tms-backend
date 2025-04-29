const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        const { username, password } = JSON.parse(event.body);

        const params = {
            AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
            ClientId: process.env.COGNITO_CLIENT_ID,
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
            },
        };

        const response = await cognito.adminInitiateAuth(params).promise();

        if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
            return {
                statusCode: COMMON.STATUS_CODES.OK,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json',
                    "Set-Cookie": `session=${response.Session}; Path=/; HttpOnly`,
                  },
                body: JSON.stringify({
                    challenge: "NEW_PASSWORD_REQUIRED",
                    message: COMMON.ERROR.NEW_PASSWORD_REQUIRED,
                    session: response.Session
                }),
            };
        }

        // Get user details including group membership
        const userInfo = await cognito.adminGetUser({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username
        }).promise();

        // Get user's groups
        const userGroups = await cognito.adminListGroupsForUser({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username
        }).promise();

        // Determine role based on group membership
        let role = COMMON.ROLE.MEMBER; // Default role
        if (userGroups.Groups.some(group => group.GroupName === process.env.ADMIN_GROUP_NAME)) {
            role = COMMON.ROLE.ADMIN;
        }

        // Get user data from DynamoDB
        const userData = await dynamodb.query({
            TableName: process.env.USERS_TABLE,
            IndexName: "EmailIndex", // Assuming there's a GSI on the email field
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: {
                ":email": username
            }
        }).promise();

        let user = {};
        
        // If we have user data in DynamoDB, use that as the base
        if (userData.Items && userData.Items.length > 0) {
            user = { ...userData.Items[0] };
        }
        
        // Add/overwrite with Cognito data
        user.email = username;
        user.role = role;
        user.groups = userGroups.Groups.map(group => group.GroupName);
        
        // Extract user attributes from Cognito
        userInfo.UserAttributes.forEach(attr => {
            user[attr.Name] = attr.Value;
        });
        
        // Add authentication info
        user.authenticationTime = new Date().toISOString();

        // Return tokens and user info on successful authentication
        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json',
                "Set-Cookie": `token=${response.AuthenticationResult.IdToken}; Path=/; HttpOnly`,
              },
            body: JSON.stringify({
                success: true,
                user: user,
                token: response.AuthenticationResult.IdToken
            }),
        };
    } catch (error) {
        console.error("Authentication error:", error);

        // Return appropriate error message based on the error type
        let statusCode = COMMON.STATUS_CODES.BAD_REQUEST;
        let errorMessage = error.message;

        if (error.code === COMMON.EXCEPTIONS.USER_NOT_FOUND || error.code === COMMON.EXCEPTIONS.NOT_AUTHORIZED) {
            statusCode = COMMON.STATUS_CODES.UNAUTHORIZED;
            errorMessage = COMMON.ERROR.BAD_CREDENTIALS;
        } else if (error.code === COMMON.EXCEPTIONS.USER_NOT_CONFIRMED) {
            statusCode = COMMON.STATUS_CODES.FORBIDDEN;
            errorMessage = COMMON.ERROR.USER_NOTE_CONFIRMED;
        } else if (error.code === COMMON.EXCEPTIONS.PASSWORD_RESET_REQUIRED) {
            statusCode = COMMON.STATUS_CODES.FORBIDDEN;
            errorMessage = COMMON.ERROR.PASSWORD_RESET_REQUIRED;
        }

        return {
            statusCode: statusCode,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json'
              },
            body: JSON.stringify({
                error: errorMessage,
                code: error.code || COMMON.ERROR.UNKNOWN_ERROR,
            }),
        };
    }
};