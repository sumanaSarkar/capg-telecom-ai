import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { TicketPriority } from './support.model';

export class CreateTicketDto {
  @ApiProperty({ example: 'cust-001' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 'Cannot access data plan details' })
  @IsString()
  @IsNotEmpty()
  issue: string;

  @ApiProperty({ example: 'medium', enum: ['low', 'medium', 'high'] })
  @IsIn(['low', 'medium', 'high'])
  priority: TicketPriority;
}
