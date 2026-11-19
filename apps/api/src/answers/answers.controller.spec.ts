import { AnswersController } from "./answers.controller";
import type { AnswerGenerationService } from "../answer-generation/answer-generation.service";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

function authenticatedRequest(userId: string): AuthenticatedRequest {
  return {
    user: { sub: userId, email: "a@b.com", iat: 0, exp: 0 },
  } as AuthenticatedRequest;
}

describe("AnswersController", () => {
  let answerGeneration: { generateAnswer: jest.Mock };
  let controller: AnswersController;

  beforeEach(() => {
    answerGeneration = { generateAnswer: jest.fn().mockResolvedValue({ refused: false }) };
    controller = new AnswersController(answerGeneration as unknown as AnswerGenerationService);
  });

  it("forwards familyId/profileId from the route, userId from the JWT, and the DTO fields to AnswerGenerationService", async () => {
    await controller.ask(authenticatedRequest("user-1"), "family-1", "profile-1", {
      question: "What was her favorite recipe?",
      conversationLanguage: "fr",
    });

    expect(answerGeneration.generateAnswer).toHaveBeenCalledWith({
      question: "What was her favorite recipe?",
      familyId: "family-1",
      profileId: "profile-1",
      userId: "user-1",
      conversationLanguage: "fr",
    });
  });

  it("never reads userId from the request body — only from the authenticated JWT", async () => {
    await controller.ask(authenticatedRequest("real-user"), "family-1", "profile-1", {
      question: "hello",
    });

    expect(answerGeneration.generateAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "real-user" }),
    );
  });

  it("returns exactly what AnswerGenerationService returns, without reshaping it", async () => {
    const response = { refused: false, answer: "x", citations: [], conversationLanguage: "en", isGenerated: true, refusalReason: null };
    answerGeneration.generateAnswer.mockResolvedValue(response);

    const result = await controller.ask(authenticatedRequest("user-1"), "family-1", "profile-1", { question: "hi" });

    expect(result).toBe(response);
  });

  it("propagates errors from AnswerGenerationService (e.g. authorization failures) without catching them", async () => {
    const error = new Error("boom");
    answerGeneration.generateAnswer.mockRejectedValue(error);

    await expect(
      controller.ask(authenticatedRequest("user-1"), "family-1", "profile-1", { question: "hi" }),
    ).rejects.toBe(error);
  });
});
