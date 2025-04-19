const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
  try {
    const { username, session, newPassword } = JSON.parse(event.body);
    
    // Using adminRespondToAuthChallenge flow
    const params = {
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: process.env.COGNITO_CLIENT_ID,
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      ChallengeResponses: {
        USERNAME: username,
        NEW_PASSWORD: newPassword
      },
      Session: session
    };

    const response = await cognito.adminRespondToAuthChallenge(params).promise();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idToken: response.AuthenticationResult.IdToken,
        accessToken: response.AuthenticationResult.AccessToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        expiresIn: response.AuthenticationResult.ExpiresIn,
        tokenType: response.AuthenticationResult.TokenType
      })
    };
  } catch (error) {
    console.error('Reset password error:', error);
    
    // Improved error handling with appropriate status codes
    let statusCode = 400;
    let errorMessage = error.message;
    
    if (error.code === 'InvalidParameterException') {
      if (error.message.includes('password')) {
        errorMessage = 'Password does not meet the requirements';
      }
    } else if (error.code === 'InvalidPasswordException') {
      errorMessage = 'Password does not meet the requirements';
    } else if (error.code === 'ExpiredCodeException' || error.code === 'NotAuthorizedException') {
      statusCode = 401;
      errorMessage = 'Session has expired. Please try signing in again.';
    }
    
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: errorMessage,
        code: error.code || 'UnknownError'
      })
    };
  }
};