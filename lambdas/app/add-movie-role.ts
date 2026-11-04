import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName, toRole } from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";

const isPositiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const isNonEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() !== "";

const roleFieldRules: [keyof Role, (value: unknown) => boolean, string][] = [
  ["movieId", isPositiveInteger, "a positive integer"],
  ["actorId", isPositiveInteger, "a positive integer"],
  ["roleName", isNonEmptyString, "a non-empty string"],
  ["roleDescription", isNonEmptyString, "a non-empty string"],
];

// Parses the JSON body and checks each role field.
// Returns the role, or a 400 response describing what is wrong.
const parseRole = (event: APIGatewayProxyEvent): Role | APIGatewayProxyResult => {
  const body = parseJsonObject(event);
  if (isResponse(body)) return body;
  const errors = roleFieldRules
    .filter(([field, isValid]) => !isValid(body[field]))
    .map(([field, , expected]) => `${field} must be ${expected}`);
  if (errors.length) {
    return response(400, { message: errors.join("; ") });
  }
  return toRole(body);
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const role = parseRole(event);
  if (isResponse(role)) return role;

  try {
    //  TOD∏O - Add role if its IDs are valid
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error",
      error: err,
    });
  }
};
