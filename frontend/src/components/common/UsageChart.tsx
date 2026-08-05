import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyTrendEntry } from '../../services/types';
import styles from './UsageChart.module.css';

interface UsageChartProps {
  data: MonthlyTrendEntry[];
}

export function UsageChart({ data }: UsageChartProps) {
  return (
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
          <YAxis stroke="#64748b" fontSize={12} unit="GB" />
          <Tooltip formatter={(value) => [`${value} GB`, 'Data used']} />
          <Bar dataKey="dataGB" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default UsageChart;
