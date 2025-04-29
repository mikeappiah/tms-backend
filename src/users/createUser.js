const AWS = require("aws-sdk");
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sfn = new AWS.StepFunctions();
const { generateSecurePassword } = require("../../utils/helpers");
const { COMMON } = require("../../utils/constants");

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;

        const userGroups = claims["cognito:groups"] || [];
        if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
            return {
                statusCode: COMMON.STATUS_CODES.FORBIDDEN,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json'
                  },
                body: JSON.stringify({
                    error: COMMON.ERROR.ADMIN_ACCESS_REQUIRED,
                }),
            };
        }

        const { email, name, role } = JSON.parse(event.body);

        if (!email || ![COMMON.ROLE.ADMIN, COMMON.ROLE.MEMBER].includes(role)) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json'
                  },
                body: JSON.stringify({ error: COMMON.ERROR.BAD_CREDENTIALS }),
            };
        }

        const tempPassword = generateSecurePassword();

        // Create user in Cognito with the temporary password
        const user = await cognito
            .adminCreateUser({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: email,
                TemporaryPassword: tempPassword,
                UserAttributes: [
                    { Name: "email", Value: email },
                    { Name: "email_verified", Value: "true" }, // Not bothering ourselves with email verification now!
                ],
                //MessageAction: "SUPPRESS",
            })
            .promise();

        // Add user to appropriate Cognito group based on role
        await cognito
            .adminAddUserToGroup({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: email,
                GroupName: role === COMMON.ROLE.ADMIN ? process.env.ADMIN_GROUP_NAME : process.env.MEMBER_GROUP_NAME,
            })
            .promise();

        // Get the user info to extract the sub ID
        const userInfo = await cognito
            .adminGetUser({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: email
            })
            .promise();
            
        // Extract the Cognito sub ID
        const userId = userInfo.UserAttributes.find(attr => attr.Name === "sub").Value;

        await dynamodb
            .put({
                TableName: process.env.USERS_TABLE,
                Item: {
                    userId,
                    email,
                    name,
                    role,
                    createdAt: new Date().toISOString(),
                    createdBy: claims.sub,
                },
            })
            .promise();

        // Start Step Function for SNS subscriptions
        await sfn
            .startExecution({
                stateMachineArn: process.env.SUBSCRIBE_USER_STATE_MACHINE_ARN,
                input: JSON.stringify({
                    userId,
                    email
                }),
            })
            .promise();

        return {
            statusCode: COMMON.STATUS_CODES.CREATED,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json'
              },
            body: JSON.stringify({
                message: COMMON.SUCCESS_MSG.USER_CREATED,
                email: process.env.ENVIRONMENT === "test" ? email : undefined,
                tempPassword: process.env.ENVIRONMENT === "test" ? tempPassword : undefined, // Only returning email & password in test environment for testing
            }),
        };
    } catch (error) {
        console.error("Create user error:", error);

        // Error handling
        let statusCode = COMMON.STATUS_CODES.INTERNAL_SERVER_ERROR;
        let errorMessage = COMMON.ERROR.UNEXPECTED_ERROR;

        if (error.code === COMMON.EXCEPTIONS.USERNAME_EXISTS) {
            statusCode = COMMON.STATUS_CODES.CONFLICT;
            errorMessage = COMMON.ERROR.USER_ALREADY_EXISTS;
        } else if (error.code === COMMON.EXCEPTIONS.INVALID_PASSWORD) {
            statusCode = COMMON.STATUS_CODES.BAD_REQUEST;
            errorMessage = COMMON.ERROR.INVALID_PASSWORD;
        } else if (error.code === COMMON.EXCEPTIONS.INVALID_PARAMETER) {
            statusCode = COMMON.STATUS_CODES.BAD_REQUEST;
            errorMessage = "Invalid parameters: " + error.message;
        }

        return {
            statusCode,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json'
              },
            body: JSON.stringify({
                error: errorMessage,
                code: error.code || COMMON.ERROR.INTERNAL_SERVER_ERROR,
            }),
        };
    }
};