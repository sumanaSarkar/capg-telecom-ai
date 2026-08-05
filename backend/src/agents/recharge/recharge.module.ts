import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RechargeController } from './recharge.controller';
import { RechargeService } from './recharge.service';

@Module({
  imports: [AuthModule],
  controllers: [RechargeController],
  providers: [RechargeService],
  exports: [RechargeService],
})
export class RechargeModule {}
