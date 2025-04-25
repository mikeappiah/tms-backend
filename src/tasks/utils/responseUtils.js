const createResponse = (statusCode, body) => {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };
};

const errorResponse = (statusCode, errorMessage, errorCode = null) => {
    return createResponse(statusCode, {
        error: errorMessage,
        code: errorCode || (statusCode === 500 ? 'InternalServerError' : 'BadRequest')
    });
};

const successResponse = (statusCode, message, data = {}) => {
    return createResponse(statusCode, {
        message,
        ...data
    });
};

module.exports = {
    createResponse,
    errorResponse,
    successResponse
};