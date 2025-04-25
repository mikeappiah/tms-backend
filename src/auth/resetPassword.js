const AWS = require("aws-sdk");
const COMMON = require("../../utils/constants");

const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
    try {
        const { username, session, newPassword } = JSON.parse(event.body);

        // Using adminRespondToAuthChallenge flow
        const params = {
            ChallengeName: COMMON.ERROR.NEW_PASSWORD_REQUIRED,
            ClientId: process.env.COGNITO_CLIENT_ID,
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            ChallengeResponses: {
                USERNAME: username,
                NEW_PASSWORD: newPassword,
            },
            Session: session,
        };

        const response = await cognito.adminRespondToAuthChallenge(params).promise();

        return {
            statusCode: 200,
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
        console.error("Reset password error:", error);

        // Initialize default status code and error message
        let statusCode = COMMON.STATUS_CODES.BAD_REQUEST;
        let errorMessage = error.message || COMMON.ERROR.UNEXPECTED_ERROR;

        switch (error.code) {
            case COMMON.EXCEPTIONS.INVALID_PARAMETER:
                errorMessage = error.message.includes("password")
                    ? COMMON.ERROR.INVALID_PASSWORD
                    : COMMON.ERROR.INVALID_PARAMETER;
                break;

            case COMMON.EXCEPTIONS.INVALID_PAASWORD:
                errorMessage = COMMON.ERROR.INVALID_PASSWORD;
                break;

            case COMMON.EXCEPTIONS.EXPIRED_CODE:
            case COMMON.EXCEPTIONS.NOT_AUTHORIZED:
                statusCode = COMMON.STATUS_CODES.UNAUTHORIZED;
                errorMessage = COMMON.ERROR.SESSION_EXPIRED;
                break;

            default:
                // Default case retains the original error message or a generic one
                errorMessage = error.message || COMMON.ERROR.UNEXPECTED_ERROR;
                statusCode = COMMON.STATUS_CODES.BAD_REQUEST;
        }

        return {
            statusCode,
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
