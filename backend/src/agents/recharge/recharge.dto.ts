import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RechargeDto {
  @ApiProperty({ example: 'cust-001' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 'plan-002' })
  @IsString()
  @IsNotEmpty()
  planId: string;
}
