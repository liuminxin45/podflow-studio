import { useState, useEffect } from 'react'
import { Button, Alert, Spin, Progress, Tag, Tooltip, message } from 'antd'
import {
  ThunderboltOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { useIdeation } from '../hooks/useIdeation'
import type { EnhancedMaterial, StructureBlock } from '../types/ideation'
import type { ContentCreationType } from '../types/workflow'

interface IdeationPanelProps {
  materials: EnhancedMaterial[]
  contentType: ContentCreationType
  visible: boolean
  onApply: (blocks: StructureBlock[], topic: { title: string; description: string }, contentType: ContentCreationType) => void
  onClose: () => void
}

export default function IdeationPanel({
  materials,
  contentType,
  visible,
  onApply,
  onClose,
}: IdeationPanelProps) {
  const {
    status,
    config,
    llmAvailable,
    workingDraft,
    generateLLMVersion,
    regenerateBlock,
    error,
    warnings,
    streamLogs,
  } = useIdeation({ materials })

  const [newsItemCount, setNewsItemCount] = useState<number | null>(null)

  useEffect(() => {
    if (contentType === 'news_brief' && materials.length > 0) {
      // 基于规则快速估算
      const count = materials.length
      let recommended: number
      if (count <= 4) recommended = Math.min(3, count)
      else if (count <= 12) recommended = Math.min(5, count)
      else if (count <= 25) recommended = Math.min(8, count)
      else recommended = Math.min(12, count)
      
      setNewsItemCount(Math.min(recommended, config.news_max_count))
    }
  }, [contentType, materials.length, config.news_max_count])

  const handleGenerate = async () => {
    await generateLLMVersion({ content_type: contentType, auto_detect_type: false })
  }

  const handleApply = () => {
    if (!workingDraft) return
    
    onApply(workingDraft.blocks, workingDraft.topic, (workingDraft.content_type || contentType) as ContentCreationType)
    message.success('已应用LLM构思结果')
    onClose()
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        width: '90%',
        maxWidth: 1200,
        maxHeight: '90vh',
        background: 'var(--bg-secondary)',
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                LLM 智能构思
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {contentType === 'news_brief' ? '新闻早报模式' : '故事叙事模式'}
                {newsItemCount && ` · 建议${newsItemCount}条新闻`}
              </div>
            </div>
          </div>
          <Button type="text" icon={<CloseCircleOutlined />} onClick={onClose} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {!llmAvailable && (
            <Alert
              type="warning"
              message="LLM未配置"
              description="请先在Settings中配置LLM接入密钥"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {error && (
            <Alert
              type="error"
              message="生成失败"
              description={
                <div>
                  <div style={{ marginBottom: 12 }}>{error}</div>
                  <Button
                    type="primary"
                    size="small"
                    icon={<SyncOutlined />}
                    onClick={handleGenerate}
                    disabled={!llmAvailable || materials.length === 0}
                  >
                    重试
                  </Button>
                </div>
              }
              showIcon
              closable
              style={{ marginBottom: 16 }}
            />
          )}

          {warnings.length > 0 && (
            <Alert
              type="warning"
              message="注意事项"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              }
              showIcon
              closable
              style={{ marginBottom: 16 }}
            />
          )}

          {status === 'idle' && (
            <div style={{
              padding: 60,
              textAlign: 'center',
              background: 'var(--bg-tertiary)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>💡</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                准备生成智能构思
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>
                基于{materials.length}条素材，AI将为您生成{contentType === 'news_brief' ? '新闻早报' : '故事叙事'}结构
              </div>
              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                onClick={handleGenerate}
                disabled={!llmAvailable || materials.length === 0}
                style={{
                  height: 40,
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                开始生成
              </Button>
            </div>
          )}

          {status === 'generating' && (
            <div style={{
              padding: 24,
              background: 'var(--bg-tertiary)',
              borderRadius: 12,
            }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <Spin size="large" />
                <div style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 20 }}>
                  AI正在分析素材并生成构思...
                </div>
              </div>
              
              {streamLogs && streamLogs.length > 0 && (
                <div style={{
                  background: 'var(--bg-primary)',
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 11,
                }}>
                  {streamLogs.map((log: string, idx: number) => (
                    <div key={idx} style={{ 
                      marginBottom: 4,
                      color: log.includes('❌') ? '#ef4444' : 
                             log.includes('✅') || log.includes('🎉') ? '#10b981' :
                             'var(--text-secondary)'
                    }}>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {status === 'complete' && workingDraft && (
            <div>
              <div style={{
                padding: 16,
                background: 'var(--bg-primary)',
                borderRadius: 12,
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {workingDraft.topic.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {workingDraft.topic.description}
                </div>
                {workingDraft.topic.auto_detected && (
                  <Tag
                    color="blue"
                    style={{ marginTop: 8, fontSize: 11 }}
                  >
                    自动检测: {workingDraft.topic.detection_reason}
                  </Tag>
                )}
              </div>

              {workingDraft.quality_score && (
                <div style={{
                  padding: 16,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 12,
                  marginBottom: 20,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                    质量评估
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                        结构完整性
                      </div>
                      <Progress
                        percent={workingDraft.quality_score.structure_completeness}
                        size="small"
                        strokeColor={workingDraft.quality_score.structure_completeness >= 70 ? '#10b981' : '#f59e0b'}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                        来源可靠性
                      </div>
                      <Progress
                        percent={workingDraft.quality_score.source_reliability}
                        size="small"
                        strokeColor={workingDraft.quality_score.source_reliability >= 70 ? '#10b981' : '#f59e0b'}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                        可播性
                      </div>
                      <Progress
                        percent={workingDraft.quality_score.speakability}
                        size="small"
                        strokeColor={workingDraft.quality_score.speakability >= 70 ? '#10b981' : '#f59e0b'}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                        综合评分
                      </div>
                      <Progress
                        percent={workingDraft.quality_score.overall}
                        size="small"
                        strokeColor={workingDraft.quality_score.overall >= 70 ? '#10b981' : '#f59e0b'}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                节目结构（共{workingDraft.blocks.length}个段落）
              </div>
              {workingDraft.blocks.map((block, idx) => (
                <div
                  key={block.id}
                  style={{
                    padding: 14,
                    background: 'var(--bg-primary)',
                    borderRadius: 10,
                    border: '1px solid var(--border-color)',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {block.title}
                      </div>
                      {block.llm_suggestions && (
                        <>
                          {block.llm_suggestions.narrative_goal && (
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>
                              📌 {block.llm_suggestions.narrative_goal}
                            </div>
                          )}
                          {block.llm_suggestions.key_points && block.llm_suggestions.key_points.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                              {block.llm_suggestions.key_points.map((point, i) => (
                                <div key={i} style={{ marginBottom: 2 }}>• {point}</div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <Tag bordered={false} style={{ fontSize: 10 }}>
                          {block.materials.length} 条素材
                        </Tag>
                        {block.llm_suggestions?.duration_estimate && (
                          <Tag bordered={false} color="blue" style={{ fontSize: 10 }}>
                            约 {Math.floor(block.llm_suggestions.duration_estimate / 60)}:{(block.llm_suggestions.duration_estimate % 60).toString().padStart(2, '0')}
                          </Tag>
                        )}
                      </div>
                    </div>
                    <Tooltip title="重新生成此段">
                      <Button
                        type="text"
                        size="small"
                        icon={<SyncOutlined />}
                        onClick={() => regenerateBlock(block.id)}
                        style={{ fontSize: 12 }}
                      />
                    </Tooltip>
                  </div>
                </div>
              ))}

              {workingDraft.news_item_plan && (
                <Alert
                  type="info"
                  message="新闻条目规划"
                  description={
                    <div>
                      <div>推荐{workingDraft.news_item_plan.recommended_count}条新闻</div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        {workingDraft.news_item_plan.reason}
                      </div>
                    </div>
                  }
                  showIcon
                  style={{ marginTop: 16 }}
                />
              )}
            </div>
          )}
        </div>

        {status === 'complete' && workingDraft && (
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-primary)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              <BulbOutlined style={{ marginRight: 6 }} />
              点击"应用"将结果导入创作台，您可以继续手动调整
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button onClick={onClose}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleApply}
                style={{ fontWeight: 600 }}
              >
                应用到创作台
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
