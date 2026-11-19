import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AnswerGenerationService } from "../answer-generation/answer-generation.service";
import { AskQuestionDto } from "./dto";
import { PerUserThrottlerGuard } from "./per-user-throttler.guard";

/**
 * Thin pass-through: every authorization decision (family membership,
 * profile permission) and every answer-safety decision (citation
 * validation, refusal) already lives in AnswerGenerationService /
 * RetrievalService — this controller does not duplicate any of it.
 *
 * Guard order matters: JwtAuthGuard must run first to populate `req.user`
 * before PerUserThrottlerGuard reads it to key the rate limit per user.
 */
@UseGuards(JwtAuthGuard, PerUserThrottlerGuard)
@Controller("families")
export class AnswersController {
  constructor(private readonly answerGeneration: AnswerGenerationService) {}

  @Post(":familyId/profiles/:profileId/ask")
  ask(
    @Req() req: AuthenticatedRequest,
    @Param("familyId") familyId: string,
    @Param("profileId") profileId: string,
    @Body() dto: AskQuestionDto,
  ) {
    return this.answerGeneration.generateAnswer({
      question: dto.question,
      familyId,
      profileId,
      userId: req.user.sub,
      conversationLanguage: dto.conversationLanguage,
    });
  }
}
