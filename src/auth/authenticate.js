const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");

const cognito = new AWS.CognitoIdentityServiceProvider();

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
                    "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                    "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
                    "Set-Cookie": `session=${response.Session}; HttpOnly; Secure; SameSite=Strict`,
                },
                body: JSON.stringify({
                    challenge: "NEW_PASSWORD_REQUIRED",
                    message: COMMON.ERROR.NEW_PASSWORD_REQUIRED,
                }),
            };
        }

        // Return tokens on successful authentication
        return {
            statusCode: COMMON.STATUS_CODES.OK,
            headers: {
                "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify({
                idToken: response.AuthenticationResult.IdToken,
                accessToken: response.AuthenticationResult.AccessToken,
                refreshToken: response.AuthenticationResult.RefreshToken,
                expiresIn: response.AuthenticationResult.ExpiresIn,
                tokenType: response.AuthenticationResult.TokenType,
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
            statusCode: COMMON.STATUS_CODES.BAD_REQUEST,
            headers: {
                "Access-Control-Allow-Origin": COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
                "Content-Type": COMMON.HEADERS.CONTENT_TYPE,
            },
            body: JSON.stringify({
                error: errorMessage,
                code: error.code || COMMON.ERROR.UNKNOWN_ERROR,
            }),
        };
    }
};
