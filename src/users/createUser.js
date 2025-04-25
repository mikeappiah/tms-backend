const {
  errorResponse,
  successResponse,
  isAdmin,
  generateSecurePassword,
  createCognitoUser,
  addUserToGroup,
  createUserRecord,
  startUserSetupWorkflow
} = require('./userUtils');

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;

    // Verify admin status
    if (!isAdmin(claims)) {
      return errorResponse(403, 'Admin access required');
    }

    const { email, firstName, lastName, role } = JSON.parse(event.body);

    // Validate inputs
    if (!email || !['admin', 'member'].includes(role)) {
      return errorResponse(400, 'Invalid email or role');
    }

    // Generate temporary password
    const tempPassword = generateSecurePassword();

    // Create user in Cognito
    const cognitoUser = await createCognitoUser(email, tempPassword);

    // Add user to appropriate group
    await addUserToGroup(email, role);

    // Create user record in DynamoDB
    await createUserRecord({
      User: cognitoUser.User,
      firstName,
      lastName,
      role
    }, claims.sub);

    // Start user setup workflow
    await startUserSetupWorkflow(cognitoUser.User.Username, email);

    // Prepare response
    const responseData = {
      user: {
        userId: cognitoUser.User.Username,
        email,
        role,
        status: 'FORCE_CHANGE_PASSWORD'
      }
    };

    // Include temp password in test environment
    if (process.env.ENVIRONMENT === 'test') {
      responseData.tempPassword = tempPassword;
    }

    return successResponse(201, 'User created successfully', responseData);
  } catch (error) {
    console.error('Create user error:', error);

    // Handle specific Cognito errors
    if (error.code === 'UsernameExistsException') {
      return errorResponse(409, 'A user with this email already exists');
    }
    if (error.code === 'InvalidPasswordException') {
      return errorResponse(400, 'Password does not meet requirements');
    }
    if (error.code === 'InvalidParameterException') {
      return errorResponse(400, `Invalid parameters: ${error.message}`);
    }

    return errorResponse(500, 'Internal server error', {
      code: error.code || 'InternalServerError'
    });
  }
};