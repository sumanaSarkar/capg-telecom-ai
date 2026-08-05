import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RoamingController } from './roaming.controller';
import { RoamingService } from './roaming.service';

@Module({
  imports: [AuthModule],
  controllers: [RoamingController],
  providers: [RoamingService],
  exports: [RoamingService],
})
export class RoamingModule {}
