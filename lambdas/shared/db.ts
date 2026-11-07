import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);
export const tableName = process.env.TABLE_NAME!;

// Fetches the item with this exact key, or undefined if there isn't one.
export const getItem = async (PK: string, SK: string) => {
  const { Item } = await ddb.send(new GetCommand({ TableName: tableName, Key: { PK, SK } }));
  return Item;
};

export * from './model';
