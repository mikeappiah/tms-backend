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

        // Scan the table
        const params = {
            TableName: process.env.USERS_TABLE,
            ScanFilter: {
                role: {
                    ComparisonOperator: "EQ",
                    AttributeValueList: [COMMON.ROLE.MEMBER],
                },
            },
        };

        const result = await dynamodb.scan(params).promise();

        // Prepare response
        const response = {
            users: result.Items,
            count: result.Count,
        };

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
