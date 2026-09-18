import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; import { MemoriesService } from './memories.service'; import { CreateMemoryDto, UpdateMemoryDto } from './dto';
@Controller() @UseGuards(JwtAuthGuard) export class MemoriesController { constructor(private service:MemoriesService){}
 @Get('families/:familyId/memories') list(@Req() req:any,@Param('familyId') familyId:string){return this.service.list(req.user.sub,familyId)}
 @Post('families/:familyId/memories') create(@Req() req:any,@Param('familyId') familyId:string,@Body() dto:CreateMemoryDto){return this.service.create(req.user.sub,familyId,dto)}
 @Patch('memories/:id') update(@Req() req:any,@Param('id') id:string,@Body() dto:UpdateMemoryDto){return this.service.update(req.user.sub,id,dto)}
 @Delete('memories/:id') remove(@Req() req:any,@Param('id') id:string){return this.service.remove(req.user.sub,id)} }
