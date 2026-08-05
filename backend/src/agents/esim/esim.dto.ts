import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ActivateEsimDto {
  @ApiProperty({ example: 'cust-001' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 'device-iphone-15' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}

export class DeactivateEsimDto {
  @ApiProperty({ example: 'cust-001' })
  @IsString()
  @IsNotEmpty()
  customerId: string;
}
