const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const { getCookies } = require("../../utils/helpers");

const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
	try {
		const cookies = getCookies(event.headers);
		const session = cookies.session;

		if (!session) {
			return {
				statusCode: COMMON.STATUS_CODES.UNAUTHORIZED,
				headers: {
					"Access-Control-Allow-Origin":
						COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
					"Content-Type": COMMON.HEADERS.CONTENT_TYPE,
				},
				body: JSON.stringify({
					error: COMMON.ERROR.SESSION_EXPIRED,
					code: COMMON.EXCEPTIONS.NOT_AUTHORIZED,
				}),
			};
		}

		const { username, newPassword } = JSON.parse(event.body);

		// Using adminRespondToAuthChallenge flow
		const params = {
			ChallengeName: "NEW_PASSWORD_REQUIRED",
			ClientId: process.env.COGNITO_CLIENT_ID,
			UserPoolId: process.env.COGNITO_USER_POOL_ID,
			ChallengeResponses: {
				USERNAME: username,
				NEW_PASSWORD: newPassword,
			},
			Session: session,
		};

		const response = await cognito.adminRespondToAuthChallenge(params).promise();

		console.log("------------RESPONSE------------", response);


		return {
			statusCode: 200,
			headers: {
				"Access-Control-Allow-Origin":
					COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
				"Content-Type": COMMON.HEADERS.CONTENT_TYPE,
				"Set-Cookie": `token=${response.AuthenticationResult.IdToken}; HttpOnly; Secure; SameSite=Strict`,
			},
			body: JSON.stringify({
				message: COMMON.SUCCESS_MSG.PASSWORD_RESET_SUCCESS,
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

			case COMMON.EXCEPTIONS.INVALID_PASSWORD:
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
				"Access-Control-Allow-Origin":
					COMMON.HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
				"Content-Type": COMMON.HEADERS.CONTENT_TYPE,
			},
			body: JSON.stringify({
				error: errorMessage,
				code: error.code || COMMON.ERROR.UNKNOWN_ERROR,
			}),
		};
	}
};
