import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type AskAction = 'ask' | 'confirm' | 'payment_success';

export class AskDto {
  @ApiProperty({ example: 'Suggest the best data plan and recharge it' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ example: 'cust-001' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional({
    example: 'ask',
    enum: ['ask', 'confirm', 'payment_success'],
  })
  @IsOptional()
  @IsIn(['ask', 'confirm', 'payment_success'])
  action?: AskAction;

  @ApiPropertyOptional({ example: 'plan-002' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsString()
  paymentId?: string;
}
