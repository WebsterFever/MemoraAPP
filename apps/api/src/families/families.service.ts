import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"; import { PrismaService } from "../prisma/prisma.service"; import { CreateFamilyDto, CreateProfileDto } from "./dto";
@Injectable() export class FamiliesService {
 constructor(private prisma:PrismaService){}
 async create(userId:string,dto:CreateFamilyDto){return this.prisma.$transaction(async tx=>{const f=await tx.family.create({data:{name:dto.name,ownerUserId:userId}});await tx.familyMembership.create({data:{familyId:f.id,userId,role:"OWNER"}});return f;});}
 async list(userId:string){return this.prisma.family.findMany({where:{memberships:{some:{userId,status:"ACTIVE"}}},include:{memberships:true,profiles:true}});}
 private async membership(userId:string,familyId:string){const m=await this.prisma.familyMembership.findUnique({where:{familyId_userId:{familyId,userId}}});if(!m||m.status!=="ACTIVE")throw new ForbiddenException();return m;}
 async createProfile(userId:string,familyId:string,dto:CreateProfileDto){const m=await this.membership(userId,familyId);if(!["OWNER","ADMIN","CONTRIBUTOR"].includes(m.role))throw new ForbiddenException();return this.prisma.$transaction(async tx=>{const p=await tx.memoryProfile.create({data:{familyId,displayName:dto.displayName,relationship:dto.relationship,preferredLanguage:dto.preferredLanguage,spokenLanguages:dto.spokenLanguages??[],biography:dto.biography,createdByUserId:userId}});await tx.memoryProfilePermission.create({data:{profileId:p.id,userId,role:"MEMORY_OWNER",grantedByUserId:userId}});return p;});}
 async profiles(userId:string,familyId:string){await this.membership(userId,familyId);return this.prisma.memoryProfile.findMany({where:{familyId,status:{not:"DELETED"}}});}
}
