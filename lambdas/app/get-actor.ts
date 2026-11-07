import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  actorKey,
  getItem,
  movieKey,
  parseId,
  toActor,
  toRole,
} from "../shared/db";
import { response, serverError } from "../shared/http";
import { logRequest } from "../shared/request-logger";

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
    const actorItem = await getItem(actorKey(actorId), actorKey(actorId));
    if (!actorItem) {
      return response(404, { message: `Actor ${actorId} not found` });
    }
    const actor = toActor(actorItem);
    if (movieId === undefined) {
      return response(200, { data: actor });
    }

    const roleItem = await getItem(movieKey(movieId), actorKey(actorId));
    if (!roleItem) {
      return response(200, { data: actor });
    }
    const { roleName, roleDescription } = toRole(roleItem);
    return response(200, { data: { ...actor, roleName, roleDescription } });
  } catch (err) {
    return serverError(err);
  }
};
