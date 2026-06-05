import { Module } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import { AdminGuard } from './admin.guard';

@Module({
  providers: [SupabaseJwtGuard, AdminGuard],
  exports: [SupabaseJwtGuard, AdminGuard],
})
export class AuthModule {}
