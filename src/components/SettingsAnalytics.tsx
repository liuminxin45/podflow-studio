import { useState } from 'react'
import {
  RightOutlined,
  RiseOutlined,
  TeamOutlined,
  LineChartOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  FireOutlined,
  StarOutlined,
} from '@ant-design/icons'

// ============================================================
// Mini Bar Chart (pure CSS)
// ============================================================

function MiniBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{value.toLocaleString()}</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>
    </div>
  )
}

// ============================================================
// Sparkline (pure CSS mini trend)
// ============================================================

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const h = 40
  const w = 140
  const step = w / (data.length - 1)

  const points = data.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {data.length > 0 && (() => {
        const lastX = (data.length - 1) * step
        const lastY = h - ((data[data.length - 1] - min) / range) * (h - 4) - 2
        return <circle cx={lastX} cy={lastY} r={3} fill={color} />
      })()}
    </svg>
  )
}

// ============================================================
// Collapsible Section
// ============================================================

function AnalyticsSection({ title, icon, children, defaultOpen = true }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
      transition: 'box-shadow 0.2s ease',
    }}
    className="settings-subsection"
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 18px',
          cursor: 'pointer',
        }}
        className="settings-node-row"
      >
        <span style={{ fontSize: 14, color: 'var(--accent-primary)' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{title}</span>
        <RightOutlined style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }} />
      </div>
      {open && (
        <div style={{ padding: '0 18px 18px', animation: 'settingsFadeIn 0.2s ease' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({ icon, label, value, trend, trendLabel, color }: {
  icon: React.ReactNode
  label: string
  value: string
  trend?: 'up' | 'down' | 'flat'
  trendLabel?: string
  color: string
}) {
  const trendColors = { up: 'var(--success-color)', down: 'var(--error-color)', flat: 'var(--text-tertiary)' }
  return (
    <div style={{
      flex: 1,
      padding: '16px',
      borderRadius: 10,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        {value}
      </div>
      {trend && trendLabel && (
        <div style={{ fontSize: 11, color: trendColors[trend], fontWeight: 500 }}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
        </div>
      )}
    </div>
  )
}

// ============================================================
// AI Suggestion Card
// ============================================================

function AISuggestionCard({ icon, text, actionLabel }: {
  icon: string
  text: string
  actionLabel?: string
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '12px 14px',
      borderRadius: 10,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-primary)',
      marginBottom: 8,
      transition: 'all 0.15s ease',
    }}
    className="settings-option-card"
    >
      <span style={{ fontSize: 18, lineHeight: 1.4 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
        {actionLabel && (
          <div style={{
            marginTop: 6,
            fontSize: 11,
            color: 'var(--accent-primary)',
            fontWeight: 500,
            cursor: 'pointer',
          }}>
            {actionLabel} →
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Real analytics data is not connected yet. Keep UI visible with explicit empty states.
// ============================================================

const WEEKLY_PLAYS: number[] = []
const AUDIENCE_AGE: Array<{ label: string; value: number; max: number }> = []
const LISTEN_HOURS: Array<{ label: string; value: number; max: number }> = []
const TOPICS: Array<{ label: string; value: number; max: number }> = []
const PLATFORMS: Array<{ label: string; value: number; max: number }> = []
const CONTENT_TREND: Array<{ type: string; trend: number[]; color: string; completionRate: string }> = []

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: '14px',
      borderRadius: 10,
      border: '1px dashed var(--border-color)',
      background: 'var(--bg-primary)',
      fontSize: 12,
      color: 'var(--text-tertiary)',
      lineHeight: 1.6,
    }}>
      {text}
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function SettingsAnalytics() {
  return (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16, color: 'var(--accent-primary)' }}><LineChartOutlined /></span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>数据与表现</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', paddingLeft: 24 }}>
          了解你的节目表现，发现听众偏好，持续优化创作
        </div>
      </div>

      {/* ======== Section 1: Overview ======== */}
      <AnalyticsSection title="节目表现概览" icon={<RiseOutlined />}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <StatCard
            icon={<PlayCircleOutlined />}
            label="总播放量"
            value="0"
            trend="flat"
            trendLabel="暂无真实数据"
            color="var(--accent-primary)"
          />
          <StatCard
            icon={<ClockCircleOutlined />}
            label="平均完播率"
            value="暂无"
            trend="flat"
            trendLabel="等待平台数据"
            color="var(--success-color)"
          />
          <StatCard
            icon={<FireOutlined />}
            label="本周新增"
            value="0"
            trend="flat"
            trendLabel="未接入统计"
            color="#f59e0b"
          />
        </div>

        <div style={{
          padding: '14px 16px',
          borderRadius: 10,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>近 7 天播放趋势</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>每日播放量</span>
          </div>
          {WEEKLY_PLAYS.length === 0 && <EmptyState text="暂无真实播放趋势。接入平台统计或导入播放数据后会在这里显示。" />}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
            {WEEKLY_PLAYS.map((v, i) => {
              const max = Math.max(...WEEKLY_PLAYS)
              const pct = (v / max) * 100
              const days = ['一', '二', '三', '四', '五', '六', '日']
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%',
                    maxWidth: 40,
                    height: `${pct}%`,
                    minHeight: 4,
                    background: i === WEEKLY_PLAYS.length - 1
                      ? 'var(--accent-primary)'
                      : 'var(--accent-light)',
                    borderRadius: 4,
                    transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  }} />
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>周{days[i]}</span>
                </div>
              )
            })}
          </div>
        </div>
      </AnalyticsSection>

      {/* ======== Section 2: Audience ======== */}
      <AnalyticsSection title="听众画像" icon={<TeamOutlined />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Age */}
          <div style={{ padding: '14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>年龄分布</div>
            {AUDIENCE_AGE.length === 0 && <EmptyState text="暂无真实听众年龄数据。" />}
            {AUDIENCE_AGE.map((d, i) => (
              <MiniBar key={i} value={d.value} max={d.max} color="var(--accent-primary)" label={d.label} />
            ))}
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
              你的核心听众以 25-34 岁为主，他们更偏好深度内容
            </div>
          </div>

          {/* Listen time */}
          <div style={{ padding: '14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>收听时间段</div>
            {LISTEN_HOURS.length === 0 && <EmptyState text="暂无真实收听时间数据。" />}
            {LISTEN_HOURS.map((d, i) => (
              <MiniBar key={i} value={d.value} max={d.max} color="#10b981" label={d.label} />
            ))}
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
              晚间是收听高峰，考虑在 19:00-20:00 发布节目
            </div>
          </div>

          {/* Popular topics */}
          <div style={{ padding: '14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>常听主题</div>
            {TOPICS.length === 0 && <EmptyState text="暂无真实主题偏好数据。" />}
            {TOPICS.map((d, i) => (
              <MiniBar key={i} value={d.value} max={d.max} color="#8b5cf6" label={d.label} />
            ))}
          </div>

          {/* Platform source */}
          <div style={{ padding: '14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>平台来源</div>
            {PLATFORMS.length === 0 && <EmptyState text="暂无真实平台来源数据。" />}
            {PLATFORMS.map((d, i) => (
              <MiniBar key={i} value={d.value} max={d.max} color="#f59e0b" label={d.label} />
            ))}
          </div>
        </div>
      </AnalyticsSection>

      {/* ======== Section 3: Content Trend ======== */}
      <AnalyticsSection title="内容表现趋势" icon={<LineChartOutlined />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CONTENT_TREND.length === 0 && <EmptyState text="暂无真实内容表现趋势。完成发布并导入平台数据后会生成趋势分析。" />}
          {CONTENT_TREND.map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
            }}>
              <div style={{ width: 90 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.type}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  完播率 {item.completionRate}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <Sparkline data={item.trend} color={item.color} />
              </div>
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                color: item.color,
                minWidth: 50,
                textAlign: 'right',
              }}>
                {item.completionRate}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: 'var(--accent-light)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          <BulbOutlined style={{ color: 'var(--accent-primary)', marginRight: 6 }} />
          当前没有足够真实数据生成趋势结论。
        </div>
      </AnalyticsSection>

      {/* ======== Section 4: 智能建议 ======== */}
      <AnalyticsSection title="智能优化建议" icon={<StarOutlined />}>
        <div style={{
          marginBottom: 12,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
        }}>
          尚未接入真实表现数据，暂不生成表现建议。
        </div>

        <AISuggestionCard
          icon="📈"
          text="近期深度分析类节目完播率比均值高出 18%，考虑增加此类内容的比重。"
          actionLabel="查看相关节目"
        />
        <AISuggestionCard
          icon="🌙"
          text="晚间 20:00-21:00 发布的节目平均播放量高出 25%，建议在此时段发布。"
        />
        <AISuggestionCard
          icon="⏱️"
          text="开头 30 秒对留存影响显著——快速进入核心话题的节目完播率更高。"
          actionLabel="查看开头优化建议"
        />
        <AISuggestionCard
          icon="🎯"
          text="15-25 分钟时长的节目表现最稳定，当前你的平均时长在合理范围内。"
        />

        <div style={{
          marginTop: 10,
          padding: '10px 14px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          fontSize: 10,
          color: 'var(--text-tertiary)',
          textAlign: 'center',
        }}>
          建议基于历史数据自动生成，仅供参考，不代表任何评判
        </div>
      </AnalyticsSection>
    </div>
  )
}
