import axios from 'axios';
import type {
  AgentCommunicationTrace,
  AskAction,
  AutopilotSettings,
  BillingRecord,
  CustomerAnalytics,
  CustomerProfile,
  EsimStatus,
  LoginResponse,
  OrchestratorResponse,
  Plan,
  RoamingStatus,
  SupportTicket,
  TicketPriority,
} from './types';

function resolveApiUrl() {
  const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;

  if (!configuredApiUrl) {
    return '/api';
  }

  if (typeof window !== 'undefined') {
    const isHostedUi = !['localhost', '127.0.0.1'].includes(window.location.hostname);
    const isLocalhostApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredApiUrl);

    // In hosted environments (for example *.app.github.dev), calling localhost points to the user's machine.
    if (isHostedUi && isLocalhostApi) {
      return '/api';
    }
  }

  return configuredApiUrl;
}

const API_URL = resolveApiUrl();

export const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export const api = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', { username, password });
    return data;
  },

  ask: async (
    message: string,
    customerId: string,
    action?: AskAction,
    planId?: string,
    paymentId?: string,
  ): Promise<OrchestratorResponse> => {
    const { data } = await apiClient.post<OrchestratorResponse>('/orchestrator/ask', {
      message,
      customerId,
      action,
      planId,
      paymentId,
    });
    return data;
  },
  getAgentCommunicationHistory: async (customerId: string): Promise<AgentCommunicationTrace[]> => {
    const { data } = await apiClient.get<AgentCommunicationTrace[]>(`/orchestrator/history/${customerId}`);
    return data;
  },

  clearAgentCommunicationHistory: async (customerId: string): Promise<void> => {
    await apiClient.delete(`/orchestrator/history/${customerId}`);
  },

  getProfile: async (customerId: string): Promise<CustomerProfile> => {
    const { data } = await apiClient.get<CustomerProfile>(`/profile/${customerId}`);
    return data;
  },

  getAnalytics: async (customerId: string): Promise<CustomerAnalytics> => {
    const { data } = await apiClient.get<CustomerAnalytics>(`/analytics/${customerId}`);
    return data;
  },

  getPlans: async (): Promise<Plan[]> => {
    const { data } = await apiClient.get<Plan[]>('/plans');
    return data;
  },

  getBilling: async (customerId: string): Promise<BillingRecord[]> => {
    const { data } = await apiClient.get<BillingRecord[]>(`/billing/${customerId}`);
    return data;
  },

  getRoaming: async (customerId: string): Promise<RoamingStatus> => {
    const { data } = await apiClient.get<RoamingStatus>(`/roaming/${customerId}`);
    return data;
  },

  enableRoaming: async (customerId: string): Promise<RoamingStatus> => {
    const { data } = await apiClient.post<RoamingStatus>('/roaming/enable', { customerId });
    return data;
  },

  disableRoaming: async (customerId: string): Promise<RoamingStatus> => {
    const { data } = await apiClient.post<RoamingStatus>('/roaming/disable', { customerId });
    return data;
  },

  getEsim: async (customerId: string): Promise<EsimStatus> => {
    const { data } = await apiClient.get<EsimStatus>(`/esim/${customerId}`);
    return data;
  },

  activateEsim: async (customerId: string, deviceId: string): Promise<EsimStatus> => {
    const { data } = await apiClient.post<EsimStatus>('/esim/activate', { customerId, deviceId });
    return data;
  },

  deactivateEsim: async (customerId: string): Promise<EsimStatus> => {
    const { data } = await apiClient.post<EsimStatus>('/esim/deactivate', { customerId });
    return data;
  },

  getSupportTickets: async (customerId: string): Promise<SupportTicket[]> => {
    const { data } = await apiClient.get<SupportTicket[]>(`/support/tickets/${customerId}`);
    return data;
  },

  createSupportTicket: async (
    customerId: string,
    issue: string,
    priority: TicketPriority,
  ): Promise<SupportTicket> => {
    const { data } = await apiClient.post<SupportTicket>('/support/tickets', {
      customerId,
      issue,
      priority,
    });
    return data;
  },

  getAutopilot: async (customerId: string): Promise<AutopilotSettings> => {
    const { data } = await apiClient.get<AutopilotSettings>(`/autopilot/${customerId}`);
    return data;
  },

  enableAutopilot: async (customerId: string): Promise<AutopilotSettings> => {
    const { data } = await apiClient.post<AutopilotSettings>(`/autopilot/${customerId}/enable`);
    return data;
  },

  disableAutopilot: async (customerId: string): Promise<AutopilotSettings> => {
    const { data } = await apiClient.delete<AutopilotSettings>(`/autopilot/${customerId}/disable`);
    return data;
  },
};

export default api;
