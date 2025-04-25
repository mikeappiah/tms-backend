const AWS = require("aws-sdk");
const COMMON = require("../../utils/constants");

const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        // Extract email from the event object directly
        let email;

        if (typeof event === "object") {
            if (event.email) {
                // Direct object containing email field
                email = event.email;
            } else if (event.input && typeof event.input === "string") {
                // If input is provided as a JSON string (uncommon case though)
                const parsed = JSON.parse(event.input);
                email = parsed.email;
            } else if (event.body && typeof event.body === "string") {
                // From API Gateway
                const parsed = JSON.parse(event.body);
                email = parsed.email;
            }
        }

        // Check if email was found
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error("Invalid or missing email address in the input");
        }

        // Subscribe to SNS Topic
        const subscriptionResult = await sns
            .subscribe({
                TopicArn: process.env.TASK_ASSIGNMENT_TOPIC,
                Protocol: "email",
                Endpoint: email,
            })
            .promise();

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            body: JSON.stringify({
                message: "Successfully subscribed to task assignment notifications",
                subscriptionArn: subscriptionResult.SubscriptionArn,
            }),
        };
    } catch (error) {
        console.error("Error subscribing to topic:", error);

        return {
            statusCode: error.statusCode || COMMON.STATUS_CODES.INTERNAL_SERVER_ERROR,
            body: JSON.stringify({
                error: error.message || "Failed to subscribe to task assignment notifications",
                details: error.code ? `AWS Error Code: ${error.code}` : undefined,
            }),
        };
    }
};
