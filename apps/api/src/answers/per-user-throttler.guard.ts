import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Rate-limits by authenticated user, not by IP. Must always run after
 * JwtAuthGuard (see `@UseGuards(JwtAuthGuard, PerUserThrottlerGuard)` on
 * AnswersController) so `req.user` is already populated — Nest runs guards
 * in the order listed. Falls back to IP only if somehow reached without an
 * authenticated user, so the limiter never silently no-ops.
 *
 * Tracking by user instead of IP matters here specifically because this
 * endpoint spends real OpenAI credits per call: a shared office/NAT IP must
 * not let one abusive user exhaust the whole building's quota, and a single
 * user switching networks must not get a fresh quota for free.
 */
@Injectable()
export class PerUserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { sub?: string } | undefined;
    return user?.sub ? `user:${user.sub}` : `ip:${req.ip as string}`;
  }
}
