import type { EventId, OptionId, QuestionId } from "../../shared/domain-types";
import type { EventDetail, HostApiClient, Question } from "./api-client";

/** レンダリングスモークテスト専用のダミー実装。同期レンダー中には呼ばれない前提で、呼ばれたら失敗させる */
export function unimplementedApiClient(): HostApiClient {
  const fail = async (): Promise<never> => {
    throw new Error("not implemented in this test");
  };
  return {
    me: fail,
    requestGoogleSignInUrl: fail,
    signOut: fail,
    listEvents: fail,
    getEvent: fail,
    createEvent: fail,
    updateEvent: fail,
    duplicateEvent: fail,
    deleteEvent: fail,
    upsertQuestion: fail,
    deleteQuestion: fail,
    reorderQuestions: fail,
    putTheme: fail,
    uploadMedia: fail,
    publish: fail,
    preflight: fail,
    getResults: fail,
    enableSharing: fail,
    disableSharing: fail,
    deleteParticipantData: fail,
    inviteCollaborator: fail,
    listCollaborators: fail,
    revokeCollaborator: fail,
    cancelInvite: fail,
    leaveCollaboration: fail,
    getInviteInfo: fail,
    acceptInvite: fail,
  };
}

export function sampleQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1" as QuestionId,
    orderIndex: 0,
    body: "1 + 1 は？",
    imageAssetId: null,
    timeLimitSec: 30,
    explanation: "",
    options: [
      { id: "o1" as OptionId, label: "1", isCorrect: false, orderIndex: 0 },
      { id: "o2" as OptionId, label: "2", isCorrect: true, orderIndex: 1 },
    ],
    ...overrides,
  };
}

export function sampleEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: "e1" as EventId,
    title: "サンプルイベント",
    subtitle: "",
    status: "draft",
    capacity: null,
    createdAt: Date.now(),
    questions: [sampleQuestion()],
    theme: {
      primaryColor: "#4338ca",
      accentColor: "#f59e0b",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      logoAssetId: null,
      backgroundAssetId: null,
      templateId: null,
    },
    role: "owner",
    ...overrides,
  };
}
