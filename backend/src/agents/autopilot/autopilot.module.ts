import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AutopilotController } from './autopilot.controller';
import { AutopilotService } from './autopilot.service';

@Module({
  imports: [AuthModule],
  controllers: [AutopilotController],
  providers: [AutopilotService],
  exports: [AutopilotService],
})
export class AutopilotModule {}
