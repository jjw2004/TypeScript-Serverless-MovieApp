import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  movieKey,
  parseId,
  tableName,
  toActor,
  toRole,
} from "../shared/db";
import { response, serverError } from "../shared/http";
import { logRequest } from "../shared/request-logger";

const getRoleItem = async (movieId: number, actorId: number) => {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: movieKey(movieId), SK: actorKey(actorId) },
    })
  );
  return Item;
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const actorId = parseId(event.pathParameters?.actorID);
  if (actorId === undefined) {
    return response(400, { message: "actorID must be a positive integer" });
  }

  const movieParam = event.queryStringParameters?.movie;
  const movieId = parseId(movieParam);
  if (movieParam !== undefined && movieId === undefined) {
    return response(400, { message: "movie must be a positive integer" });
  }
  try {
    const actorResult = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: actorKey(actorId), SK: actorKey(actorId) },
      })
    );

    if (!actorResult.Item) {
      return response(404, { message: `Actor ${actorId} not found` });
    }
    const actor = toActor(actorResult.Item);
    if (movieId === undefined) {
      return response(200, { data: actor });
    }

    const roleItem = await getRoleItem(movieId, actorId);
    if (!roleItem) {
      return response(200, { data: actor });
    }
    const { roleName, roleDescription } = toRole(roleItem);
    return response(200, { data: { ...actor, roleName, roleDescription } });
  } catch (err) {
    return serverError(err);
  }
};
