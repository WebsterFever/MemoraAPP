import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoryDto, UpdateMemoryDto } from './dto';
// Ready-only media so a still-uploading/failed recording never appears as
// playable to other family members; ordered newest-first for display.
const MEMORY_INCLUDE = { profile: true, mediaAssets: { where: { status: 'READY' as const }, orderBy: { createdAt: 'desc' as const } } };
@Injectable() export class MemoriesService { constructor(private prisma:PrismaService){}
 private async member(userId:string,familyId:string,write=false){const m=await this.prisma.familyMembership.findUnique({where:{familyId_userId:{familyId,userId}}});if(!m||m.status!=='ACTIVE'||(write&&m.role==='VIEWER'))throw new ForbiddenException();return m;}
 async list(userId:string,familyId:string){await this.member(userId,familyId);return this.prisma.memory.findMany({where:{familyId},include:MEMORY_INCLUDE,orderBy:[{occurredAt:'desc'},{createdAt:'desc'}]});}
 async create(userId:string,familyId:string,d:CreateMemoryDto){await this.member(userId,familyId,true);if(d.profileId){const p=await this.prisma.memoryProfile.findFirst({where:{id:d.profileId,familyId}});if(!p)throw new NotFoundException('Profile not found');}return this.prisma.memory.create({data:{familyId,profileId:d.profileId,title:d.title.trim(),story:d.story.trim(),occurredAt:d.occurredAt?new Date(d.occurredAt):undefined,createdByUserId:userId},include:MEMORY_INCLUDE});}
 async update(userId:string,id:string,d:UpdateMemoryDto){const memory=await this.prisma.memory.findUnique({where:{id}});if(!memory)throw new NotFoundException('Memory not found');await this.member(userId,memory.familyId,true);if(d.profileId){const p=await this.prisma.memoryProfile.findFirst({where:{id:d.profileId,familyId:memory.familyId}});if(!p)throw new NotFoundException('Profile not found');}return this.prisma.memory.update({where:{id},data:{...d,occurredAt:d.occurredAt?new Date(d.occurredAt):undefined},include:MEMORY_INCLUDE});}
 async remove(userId:string,id:string){const memory=await this.prisma.memory.findUnique({where:{id}});if(!memory)throw new NotFoundException('Memory not found');await this.member(userId,memory.familyId,true);await this.prisma.memory.delete({where:{id}});return {deleted:true};}
}
