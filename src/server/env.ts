export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  QUIZ_SESSION: DurableObjectNamespace<import("./session/quiz-session-do").QuizSessionDO>;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  PARTICIPANT_TOKEN_SECRET: string;
}
