const isAdmin = (claims, adminGroupName) => {
    const userGroups = claims['cognito:groups'] || [];
    return userGroups.includes(adminGroupName);
};

const getUserInfo = (claims) => {
    return {
        userId: claims.sub,
        username: claims['cognito:username'] || claims.email || claims.sub
    };
};

const isTaskOwner = (task, userId, username) => {
    return task.userId === userId || task.userId === username;
};

module.exports = {
    isAdmin,
    getUserInfo,
    isTaskOwner
};