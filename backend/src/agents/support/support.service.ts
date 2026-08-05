import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SupportTicket, TicketPriority, TicketStatus } from './support.model';

const INITIAL_TICKETS: SupportTicket[] = [
  {
    id: 'ticket-001',
    customerId: 'cust-001',
    issue: 'Unable to activate international roaming',
    priority: 'medium',
    status: 'open',
    createdAt: '2024-05-20T10:00:00.000Z',
  },
  {
    id: 'ticket-002',
    customerId: 'cust-001',
    issue: 'Billing amount discrepancy on last invoice',
    priority: 'high',
    status: 'in_progress',
    createdAt: '2024-06-01T14:30:00.000Z',
  },
];

@Injectable()
export class SupportService {
  private readonly tickets: SupportTicket[] = [...INITIAL_TICKETS];

  getTickets(customerId: string): SupportTicket[] {
    return this.tickets.filter((ticket) => ticket.customerId === customerId);
  }

  createTicket(
    customerId: string,
    issue: string,
    priority: TicketPriority,
  ): SupportTicket {
    const ticket: SupportTicket = {
      id: `ticket-${uuidv4().slice(0, 8)}`,
      customerId,
      issue,
      priority,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.tickets.push(ticket);
    return ticket;
  }

  updateTicket(ticketId: string, status: TicketStatus): SupportTicket {
    const ticket = this.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }
    ticket.status = status;
    return ticket;
  }
}
