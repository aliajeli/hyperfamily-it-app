'use client'

import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'

const tooltipStyle = {
  background: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--border))',
  borderRadius: 8,
  fontSize: 9,
  color: 'rgb(var(--text))',
  padding: '5px 7px'
}

export default function PingChart({ data = [], compact = false }) {
  if (compact) {
    return (
      <div className="h-7 w-full" aria-label="Recent router ping response chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 3, right: 2, left: 2, bottom: 3 }}>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [value == null ? 'Offline' : `${value} ms`, 'Response']}
              labelFormatter={(label) => `Check #${label}`}
            />
            <Line
              type="monotone"
              dataKey="ping_time"
              connectNulls={false}
              stroke="#88C0D0"
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 2.5, fill: '#5E81AC' }}
              isAnimationActive
              animationDuration={400}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div className="h-36 w-full" aria-label="Recent router ping response chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="sequence" axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} domain={[0, 'auto']} unit="ms" />
          <Tooltip
            contentStyle={{ ...tooltipStyle, borderRadius: 12, fontSize: 11 }}
            formatter={(value) => [value == null ? 'Offline' : `${value} ms`, 'Response']}
            labelFormatter={(label) => `Check #${label}`}
          />
          <Line type="monotone" dataKey="ping_time" connectNulls={false} stroke="#88C0D0" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#5E81AC' }} isAnimationActive animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
