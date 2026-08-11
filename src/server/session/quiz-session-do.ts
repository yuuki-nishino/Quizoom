import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

export class QuizSessionDO extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response("QuizSessionDO placeholder", { status: 501 });
  }
}
