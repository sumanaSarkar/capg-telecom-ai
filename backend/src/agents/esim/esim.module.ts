import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { EsimController } from './esim.controller';
import { EsimService } from './esim.service';

@Module({
  imports: [AuthModule],
  controllers: [EsimController],
  providers: [EsimService],
  exports: [EsimService],
})
export class EsimModule {}
