import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { MediaService } from "./media.service";
import { CreateMediaUploadDto } from "./dto";

@Controller()
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Post("memories/:memoryId/media")
  create(@Req() req: AuthenticatedRequest, @Param("memoryId") memoryId: string, @Body() dto: CreateMediaUploadDto) {
    return this.service.createUpload(req.user.sub, memoryId, dto);
  }

  @Patch("media/:id/complete")
  complete(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.completeUpload(req.user.sub, id);
  }

  @Get("media/:id/playback-url")
  playbackUrl(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.getPlaybackUrl(req.user.sub, id);
  }

  @Delete("media/:id")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.remove(req.user.sub, id);
  }
}
