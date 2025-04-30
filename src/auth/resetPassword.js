const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");
const { getCookies } = require("../../utils/helpers");

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
	try {
		const cookies = getCookies(event.headers);
		const session = cookies.session;

		
		const { username, newPassword } = JSON.parse(event.body);
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
		user.passwordResetTime = new Date().toISOString();

		return {
			statusCode: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
				'Access-Control-Allow-Credentials': true,
				'Content-Type': 'application/json',
				"Set-Cookie": `token=${response.AuthenticationResult.IdToken}; Path=/; HttpOnly`,
			  },
			body: JSON.stringify({
				message: COMMON.SUCCESS_MSG.PASSWORD_RESET_SUCCESS,
				user: user,
				token: response.AuthenticationResult.IdToken
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