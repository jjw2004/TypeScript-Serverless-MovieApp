import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  type CancellationReason,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName, toRole } from "../shared/db";
import { isResponse, parseJsonObject, response, serverError } from "../shared/http";
import { logRequest } from "../shared/request-logger";

const isPositiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
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

// Writes the role only if the movie and actor exist and the role doesn't yet.
// The order of TransactItems matches the order of CancellationReasons.
const addRoleTransaction = (role: Role) =>
  new TransactWriteCommand({
    TransactItems: [
      {
        ConditionCheck: {
          TableName: tableName,
          Key: { PK: movieKey(role.movieId), SK: movieKey(role.movieId) },
          ConditionExpression: "attribute_exists(PK)",
        },
      },
      {
        ConditionCheck: {
          TableName: tableName,
          Key: { PK: actorKey(role.actorId), SK: actorKey(role.actorId) },
          ConditionExpression: "attribute_exists(PK)",
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: { PK: movieKey(role.movieId), SK: actorKey(role.actorId), ...role },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    ],
  });

const conditionFailed = (reason?: CancellationReason) =>
  reason?.Code === "ConditionalCheckFailed";

// Maps failed conditions to 404 (movie/actor missing) or 409 (role exists).
// Returns undefined for any other cancellation, e.g. a transaction conflict.
const cancellationResponse = (
  err: TransactionCanceledException,
  role: Role
): APIGatewayProxyResult | undefined => {
  const [movieCheck, actorCheck, rolePut] = err.CancellationReasons ?? [];
  const missing = [
    conditionFailed(movieCheck) && `Movie ${role.movieId}`,
    conditionFailed(actorCheck) && `Actor ${role.actorId}`,
  ].filter(Boolean);
  if (missing.length) {
    return response(404, { message: `${missing.join(" and ")} not found` });
  }
  if (conditionFailed(rolePut)) {
    return response(409, {
      message: `Actor ${role.actorId} already has a role in movie ${role.movieId}`,
    });
  }
  return undefined;
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const role = parseRole(event);
  if (isResponse(role)) return role;

  try {
    await ddb.send(addRoleTransaction(role));
    return response(201, { data: role });
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const failure = cancellationResponse(err, role);
      if (failure) return failure;
    }
    return serverError(err);
  }
};
