const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

class DynamoService {
    constructor(tableName) {
        this.tableName = tableName;
    }

    async getItem(key) {
        const result = await docClient.send(
            new GetCommand({
                TableName: this.tableName,
                Key: key,
            })
        );
        return result.Item;
    }

    async putItem(item) {
        await docClient.send(
            new PutCommand({
                TableName: this.tableName,
                Item: item,
            })
        );
        return item;
    }

    async updateItem(key, updateExpression, expressionAttributeNames, expressionAttributeValues, returnValues = "ALL_NEW") {
        const result = await docClient.send(
            new UpdateCommand({
                TableName: this.tableName,
                Key: key,
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: returnValues,
            })
        );
        return result.Attributes;
    }

    async scan(filterExpression = null, expressionAttributeValues = null) {
        const params = {
            TableName: this.tableName,
        };

        if (filterExpression) {
            params.FilterExpression = filterExpression;
            params.ExpressionAttributeValues = expressionAttributeValues;
        }

        const result = await docClient.send(new ScanCommand(params));
        return result.Items;
    }
}

module.exports = DynamoService;