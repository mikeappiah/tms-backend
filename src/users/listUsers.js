const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
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

        const queryParams = event.queryStringParameters || {};
        const limit = parseInt(queryParams.limit) || 50;
        const lastEvaluatedKey = queryParams.nextToken
            ? JSON.parse(Buffer.from(queryParams.nextToken, "base64").toString())
            : undefined;

        // Scan the table with pagination
        const params = {
            TableName: process.env.USERS_TABLE,
            Limit: limit,
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamodb.scan(params).promise();

        // Prepare response with pagination token if needed
        const response = {
            users: result.Items,
            count: result.Count,
        };

        if (result.LastEvaluatedKey) {
            response.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64");
        }

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify(response),
        };
    } catch (error) {
        console.error("List users error:", error);

        return {
            statusCode: COMMON.STATUS_CODES.INTERNAL_SERVER_ERROR,
            headers: {
                "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify({
                error: COMMON.ERROR.FAILED_FETCH_USERS,
                message: error.message,
            }),
        };
    }
};
