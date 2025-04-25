const AWS = require("aws-sdk");
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sfn = new AWS.StepFunctions();
const { generateSecurePassword } = require("../../utils/helpers");

exports.handler = async (event) => {
    try {
        // Admin permissions check from token
        const claims = event.requestContext.authorizer.claims;

        // Check if user is in admin group (using cognito:groups from the JWT token)
        const userGroups = claims["cognito:groups"] || [];
        if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
            return {
                statusCode: 403,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ error: "Admin access required" }),
            };
        }

        const { email, firstName, lastName, role } = JSON.parse(event.body);

        // Validate inputs
        if (!email || !["admin", "member"].includes(role)) {
            return {
                statusCode: 400,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ error: "Bad credentials" }),
            };
        }

        // Generate a secure temporary password
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
                // MessageAction: 'SUPPRESS'
            })
            .promise();

        // Add user to appropriate Cognito group based on role
        await cognito
            .adminAddUserToGroup({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: email,
                GroupName: role === "admin" ? process.env.ADMIN_GROUP_NAME : process.env.MEMBER_GROUP_NAME,
            })
            .promise();

        // Store in UsersTable
        await dynamodb
            .put({
                TableName: process.env.USERS_TABLE,
                Item: {
                    userId: user.User.Username,
                    email,
                    firstName: firstName,
                    lastName: lastName,
                    role,
                    createdAt: new Date().toISOString(),
                    createdBy: claims.sub,
                    status: "FORCE_CHANGE_PASSWORD",
                },
            })
            .promise();

        // Start Step Function for SNS subscriptions
        await sfn
            .startExecution({
                stateMachineArn: process.env.SUBSCRIBE_USER_STATE_MACHINE_ARN,
                input: JSON.stringify({
                    userId: user.User.Username,
                    email,
                }),
            })
            .promise();

        return {
            statusCode: 201,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: "User created successfully",
                user: {
                    userId: user.User.Username,
                    email,
                    role,
                    status: "FORCE_CHANGE_PASSWORD",
                },
                tempPassword: process.env.ENVIRONMENT === "test" ? tempPassword : undefined, // Only returning password in test environment for testing
            }),
        };
    } catch (error) {
        console.error("Create user error:", error);

        // Error handling
        let statusCode = 500;
        let errorMessage = "Internal server error";

        if (error.code === "UsernameExistsException") {
            statusCode = 409; // Conflict
            errorMessage = "A user with this email already exists";
        } else if (error.code === "InvalidPasswordException") {
            statusCode = 400;
            errorMessage = "Password does not meet requirements";
        } else if (error.code === "InvalidParameterException") {
            statusCode = 400;
            errorMessage = "Invalid parameters: " + error.message;
        }

        return {
            statusCode,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                error: errorMessage,
                code: error.code || "InternalServerError",
            }),
        };
    }
};
