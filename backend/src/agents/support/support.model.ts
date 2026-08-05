export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  customerId: string;
  issue: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
}
