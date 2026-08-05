import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'cust-001' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 'plan-002' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({ example: 49.99 })
  @IsNumber()
  amount: number;
}

export class ConfirmPaymentDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  @IsNotEmpty()
  paymentId: string;
}
