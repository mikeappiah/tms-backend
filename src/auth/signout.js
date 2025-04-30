const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");

const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
    try {
        // Extract the token from the request - either from cookie or from body
        let token;
        
        if (event.headers && event.headers.Cookie) {
            // Extract token from cookie if present
            const cookies = event.headers.Cookie.split(';');
            const tokenCookie = cookies.find(cookie => cookie.trim().startsWith('token='));
            if (tokenCookie) {
                token = tokenCookie.split('=')[1].trim();
            }
        }
        
        // If token wasn't found in cookies, check request body
        if (!token && event.body) {
            const body = JSON.parse(event.body);
            token = body.token;
        }
        
        if (!token) {
            return {
                statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                    'Access-Control-Allow-Credentials': true,
                    'Content-Type': 'application/json'
                  },
                body: JSON.stringify({
                    error: COMMON.ERROR.TOKEN_REQUIRED,
                    code: COMMON.EXCEPTIONS.MISSING_TOKEN,
                }),
            };
        }

        // Extracting the username from the token payload
        const tokenPayload = token.split('.')[1];
        const decodedPayload = Buffer.from(tokenPayload, 'base64').toString();
        const payload = JSON.parse(decodedPayload);
        console.log('DECODED TOKEN PAYLOAD', payload);
        const username = payload['cognito:username'] || payload.email || payload.sub;

        // Sign out the user from Cognito
        await cognito.adminUserGlobalSignOut({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username
        }).promise();

        // Return success response with cookie clearing
        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json',
                "Set-Cookie": "token=; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
              },
            body: JSON.stringify({
                success: true,
                message: "Successfully logged out",
            }),
        };
    } catch (error) {
        console.error("Logout error:", error);
        
        return {
            statusCode: COMMON.STATUS_CODES.INTERNAL_SERVER_ERROR,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json'
              },
            body: JSON.stringify({
                error: COMMON.ERROR.LOGOUT_FAILED || "Failed to log out",
                code: error.code || COMMON.ERROR.UNKNOWN_ERROR,
            }),
        };
    }
};