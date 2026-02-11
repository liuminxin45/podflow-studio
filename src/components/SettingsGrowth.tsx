import { useState } from 'react'
import {
  RightOutlined,
  TrophyOutlined,
  EditOutlined,
  RadarChartOutlined,
  RocketOutlined,
  HeartOutlined,
  BulbOutlined,
} from '@ant-design/icons'

// ============================================================
// Collapsible Section (shared pattern)
// ============================================================

function GrowthSection({ title, icon, children, defaultOpen = true }: {
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
// Radar Chart (pure CSS/SVG)
// ============================================================

interface RadarDimension {
  label: string
  value: number // 0-100
  color: string
}

function RadarChart({ dimensions }: { dimensions: RadarDimension[] }) {
  const n = dimensions.length
  const cx = 120, cy = 120, r = 90
  const angleStep = (2 * Math.PI) / n

  // Helper: point on polygon
  const pt = (i: number, radius: number) => {
    const angle = -Math.PI / 2 + i * angleStep
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  }

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Data polygon
  const dataPoints = dimensions.map((d, i) => {
    const p = pt(i, (d.value / 100) * r)
    return `${p.x},${p.y}`
  }).join(' ')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={240} height={240} style={{ display: 'block' }}>
        {/* Grid rings */}
        {rings.map((ring, ri) => {
          const ringPoints = Array.from({ length: n }, (_, i) => {
            const p = pt(i, ring * r)
            return `${p.x},${p.y}`
          }).join(' ')
          return (
            <polygon
              key={ri}
              points={ringPoints}
              fill="none"
              stroke="var(--border-color)"
              strokeWidth={1}
              opacity={0.6}
            />
          )
        })}

        {/* Axis lines */}
        {Array.from({ length: n }, (_, i) => {
          const p = pt(i, r)
          return (
            <line
              key={i}
              x1={cx} y1={cy}
              x2={p.x} y2={p.y}
              stroke="var(--border-color)"
              strokeWidth={1}
              opacity={0.4}
            />
          )
        })}

        {/* Data polygon */}
        <polygon
          points={dataPoints}
          fill="rgba(37, 99, 235, 0.12)"
          stroke="var(--accent-primary)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dimensions.map((d, i) => {
          const p = pt(i, (d.value / 100) * r)
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="var(--bg-secondary)"
              stroke={d.color}
              strokeWidth={2}
            />
          )
        })}

        {/* Labels */}
        {dimensions.map((d, i) => {
          const p = pt(i, r + 18)
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--text-secondary)"
              fontWeight={500}
            >
              {d.label}
            </text>
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dimensions.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: d.color,
            }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 70 }}>{d.label}</span>
            <div style={{
              width: 60,
              height: 4,
              background: 'var(--bg-tertiary)',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${d.value}%`,
                background: d.color,
                borderRadius: 2,
                transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Style Tag Card
// ============================================================

function StyleTagCard({ label, value, trend, icon }: {
  label: string
  value: string
  trend: string
  icon: string
}) {
  return (
    <div style={{
      flex: 1,
      padding: '14px',
      borderRadius: 10,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ fontSize: 18, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--success-color)', fontWeight: 500 }}>{trend}</div>
    </div>
  )
}

// ============================================================
// Growth Suggestion Card
// ============================================================

function GrowthSuggestionCard({ icon, title, text, tone }: {
  icon: string
  title: string
  text: string
  tone: 'encourage' | 'gentle' | 'insight'
}) {
  const toneStyles = {
    encourage: { bg: '#ecfdf5', border: '#10b981', accent: '#10b981' },
    gentle: { bg: '#eff6ff', border: '#2563eb', accent: '#2563eb' },
    insight: { bg: '#fefce8', border: '#f59e0b', accent: '#f59e0b' },
  }
  const s = toneStyles[tone]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '14px 16px',
      borderRadius: 10,
      border: `1px solid ${s.border}20`,
      background: s.bg,
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 20, lineHeight: 1.3 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
      </div>
    </div>
  )
}

// ============================================================
// Expression Issue Card
// ============================================================

function ExpressionIssueCard({ label, desc, severity }: {
  label: string
  desc: string
  severity: 'low' | 'medium' | 'high'
}) {
  const sevColors = {
    low: { color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)', label: '轻微' },
    medium: { color: '#f59e0b', bg: '#fffbeb', label: '可优化' },
    high: { color: 'var(--accent-primary)', bg: 'var(--accent-light)', label: '建议关注' },
  }
  const s = sevColors[severity]

  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 10,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-primary)',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{
          fontSize: 10,
          fontWeight: 500,
          color: s.color,
          background: s.bg,
          padding: '1px 8px',
          borderRadius: 4,
        }}>
          {s.label}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

// ============================================================
// Mock Data
// ============================================================

const RADAR_DIMENSIONS: RadarDimension[] = [
  { label: '结构清晰度', value: 82, color: '#2563eb' },
  { label: '观点深度', value: 75, color: '#8b5cf6' },
  { label: '节奏控制', value: 68, color: '#10b981' },
  { label: '表达简洁度', value: 58, color: '#f59e0b' },
  { label: '叙事吸引力', value: 72, color: '#ef4444' },
]

// ============================================================
// Main Component
// ============================================================

export default function SettingsGrowth() {
  return (
    <div style={{ animation: 'settingsContentIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16, color: 'var(--accent-primary)' }}><TrophyOutlined /></span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>创作者成长</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', paddingLeft: 24 }}>
          基于你的创作历史，提供风格洞察与成长建议，帮助你持续进步
        </div>
      </div>

      {/* Warm intro */}
      <div style={{
        padding: '14px 18px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, #eff6ff 0%, #ecfdf5 100%)',
        border: '1px solid #bfdbfe40',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 28 }}>🌱</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            你已创作了 24 期节目
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            每一期都是成长。以下分析基于你全部创作历史，帮你发现自己的进步与潜力方向。
          </div>
        </div>
      </div>

      {/* ======== Section 1: Style Analysis ======== */}
      <GrowthSection title="创作风格分析" icon={<EditOutlined />}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <StyleTagCard
            icon="📊"
            label="当前主要风格"
            value="理性分析型"
            trend="近 8 期保持稳定"
          />
          <StyleTagCard
            icon="🔄"
            label="风格变化"
            value="渐趋深度化"
            trend="深度内容占比 ↑ 15%"
          />
          <StyleTagCard
            icon="⭐"
            label="最受欢迎风格"
            value="深度 + 冷静"
            trend="完播率最高组合"
          />
        </div>

        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-primary)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>
            风格演变轨迹
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {[
              { label: '起步期', desc: '新闻播报', color: 'var(--text-tertiary)' },
              { label: '探索期', desc: '评论尝试', color: '#f59e0b' },
              { label: '成长期', desc: '深度分析', color: 'var(--accent-primary)' },
              { label: '当前', desc: '理性深度', color: 'var(--success-color)' },
            ].map((phase, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {/* Connecting line */}
                {i > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: '-50%',
                    top: 8,
                    width: '100%',
                    height: 2,
                    background: i === 3
                      ? 'linear-gradient(90deg, var(--accent-primary), var(--success-color))'
                      : 'var(--border-color)',
                    zIndex: 0,
                  }} />
                )}
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: phase.color,
                  border: '2px solid var(--bg-secondary)',
                  boxShadow: i === 3 ? `0 0 0 3px ${phase.color}30` : 'none',
                  zIndex: 1,
                  marginBottom: 6,
                }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>{phase.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center' }}>{phase.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </GrowthSection>

      {/* ======== Section 2: Expression Optimization ======== */}
      <GrowthSection title="表达优化建议" icon={<BulbOutlined />}>
        <div style={{
          marginBottom: 12,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
        }}>
          以下洞察来自对你近期内容的分析，旨在帮助你让表达更精炼。这些不是批评，而是进步的方向。
        </div>

        <ExpressionIssueCard
          label="高频冗余词"
          desc="「其实」「然后」「就是说」出现频率较高，精简后内容节奏会更紧凑。近 5 期平均每期出现 12 次。"
          severity="medium"
        />
        <ExpressionIssueCard
          label="结构重复模式"
          desc="近 3 期开头结构相似（背景介绍→观点→展开），尝试变换开头方式可增加新鲜感。"
          severity="low"
        />
        <ExpressionIssueCard
          label="开头吸引力"
          desc="开头 30 秒进入核心话题的节目留存率高出 20%。最近几期开头稍长，可以考虑更快切入。"
          severity="high"
        />

        <div style={{
          marginTop: 10,
          padding: '10px 14px',
          background: 'var(--accent-light)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          <HeartOutlined style={{ color: 'var(--accent-primary)', marginRight: 6 }} />
          这些都是很常见的表达习惯，意识到它们就已经迈出了优化的第一步。
        </div>
      </GrowthSection>

      {/* ======== Section 3: Capability Radar ======== */}
      <GrowthSection title="创作能力成长" icon={<RadarChartOutlined />}>
        <div style={{
          marginBottom: 12,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
        }}>
          基于你的全部创作历史，我们从多个维度描绘了你的创作能力画像。这不是评分，而是帮助你了解自己的创作特质。
        </div>

        <div style={{
          padding: '20px',
          borderRadius: 12,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-primary)',
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 14,
        }}>
          <RadarChart dimensions={RADAR_DIMENSIONS} />
        </div>

        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          <BulbOutlined style={{ color: 'var(--accent-primary)', marginRight: 6 }} />
          你的结构清晰度和观点深度是明显优势。表达简洁度还有提升空间 — 但这恰恰是最容易改善的维度。
        </div>
      </GrowthSection>

      {/* ======== Section 4: Long-term Suggestions ======== */}
      <GrowthSection title="长期成长建议" icon={<RocketOutlined />}>
        <div style={{
          marginBottom: 12,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
        }}>
          以下建议着眼长期成长，不急于一时。选择你感兴趣的方向，按自己的节奏尝试。
        </div>

        <GrowthSuggestionCard
          icon="🔄"
          title="尝试反向观点"
          text="你擅长正向论证，如果偶尔加入对立视角的探讨，会让内容更有张力和深度。可以从一个小的反面论点开始。"
          tone="gentle"
        />
        <GrowthSuggestionCard
          icon="📖"
          title="增加故事型表达"
          text="你的分析能力很强，如果在开头或段落间穿插小故事，能让内容更有温度。数据分析类节目尤其适合「故事+观点」结构。"
          tone="encourage"
        />
        <GrowthSuggestionCard
          icon="⏱️"
          title="探索短节目格式"
          text="你的节目时长稳定在 25-30 分钟，非常好。但偶尔尝试 8-10 分钟的精华版，可以覆盖更多碎片化听众。"
          tone="insight"
        />
        <GrowthSuggestionCard
          icon="🎙️"
          title="语音节奏变化"
          text="适当增加语速变化和停顿，能让关键观点更有冲击力。尤其是在引出核心论点前的短暂停顿，效果显著。"
          tone="gentle"
        />

        {/* Encouraging footer */}
        <div style={{
          marginTop: 16,
          padding: '16px 20px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%)',
          border: '1px solid #10b98120',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            保持你的创作节奏
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
            每位创作者都有自己的成长路径。这些建议只是方向参考，你的坚持和热情才是最重要的。
          </div>
        </div>
      </GrowthSection>
    </div>
  )
}
