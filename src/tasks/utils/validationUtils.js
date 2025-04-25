const isValidISODate = (dateString) => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

    if (!isoRegex.test(dateString)) {
        return false;
    }

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
};

const validateTaskInput = (task) => {
    const { name, description, responsibility, deadline, userId } = task;

    if (!name || !description || !responsibility || !deadline || !userId) {
        return {
            isValid: false,
            error: 'Missing required fields'
        };
    }

    if (!isValidISODate(deadline)) {
        return {
            isValid: false,
            error: 'Invalid deadline format. Use ISO date format.'
        };
    }

    return { isValid: true };
};

module.exports = {
    isValidISODate,
    validateTaskInput
};
