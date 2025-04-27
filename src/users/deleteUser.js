const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        const claims = event.requestContext.authorizer.claims;

        const userGroups = claims["cognito:groups"] || [];
        if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
            return {
                statusCode: COMMON.STATUS_CODES.FORBIDDEN,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({
                    error: COMMON.ERROR.ADMIN_ACCESS_REQUIRED,
                }),
            };
        }

        const { userId } = event.pathParameters;

        if (!userId) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.USER_ID_REQUIRED }),
            };
        }

        // Verifying user existence
        const userResponse = await dynamodb
            .get({
                TableName: process.env.USERS_TABLE,
                Key: { userId },
            })
            .promise();

        if (!userResponse.Item) {
            return {
                statusCode: COMMON.STATUS_CODES.NOT_FOUND,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({ error: COMMON.ERROR.USER_NOT_FOUND }),
            };
        }

        const user = userResponse.Item;

        // Preventing admins from deleting themselves
        if (user.userId === claims.sub) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                },
                body: JSON.stringify({
                    error: COMMON.ERROR.CANNOT_DELETE_OWN_ACCOUNT,
                }),
            };
        }

        // Deleting user from Cognito
        await cognito
            .adminDeleteUser({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: userId,
            })
            .promise();

        // Delete the user from DynamoDB
        await dynamodb
            .delete({
                TableName: process.env.USERS_TABLE,
                Key: { userId },
            })
            .promise();

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify({
                message: COMMON.SUCCESS_MSG.USER_DELETED,
                userId: userId,
            }),
        };
    } catch (error) {
        console.error("Delete user error:", error);

        // Error handling
        let statusCode = 500;
        let errorMessage = "Internal server error";

        if (error.code === "UserNotFoundException") {
            statusCode = 404;
            errorMessage = "User not found in Cognito";
        } else if (error.code === "ResourceNotFoundException") {
            statusCode = 404;
            errorMessage = "User not found";
        } else if (error.code === "AccessDeniedException") {
            statusCode = 403;
            errorMessage = "Access denied to delete this user";
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
