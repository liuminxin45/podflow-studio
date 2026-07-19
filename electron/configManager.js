const fs = require('fs')
const path = require('path')
const { app } = require('electron')

class ConfigManager {
  constructor() {
    // 配置文件存储在用户数据目录
    this.configDir = path.join(app.getPath('userData'), 'node-configs')
    this.ensureConfigDir()
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true })
    }
  }

  getConfigPath(nodeName) {
    return path.join(this.configDir, `${nodeName}.json`)
  }

  normalizeNodeConfig(nodeName, config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return config
    const normalized = { ...config }
    if (nodeName === 'publish') {
      // Removed in 2.4: publishing now always produces only the local archive and RSS.
      delete normalized.enabled_platforms
    }
    return normalized
  }

  // 保存节点配置
  saveNodeConfig(nodeName, config) {
    try {
      const configPath = this.getConfigPath(nodeName)
      const normalized = this.normalizeNodeConfig(nodeName, config)
      fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), 'utf-8')
      return { success: true }
    } catch (error) {
      console.error(`Failed to save config for ${nodeName}:`, error)
      return { success: false, error: error.message }
    }
  }

  // 加载节点配置
  loadNodeConfig(nodeName) {
    try {
      const configPath = this.getConfigPath(nodeName)
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8')
        const parsed = JSON.parse(data)
        const normalized = this.normalizeNodeConfig(nodeName, parsed)
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
          fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), 'utf-8')
        }
        return normalized
      }
      return null
    } catch (error) {
      console.error(`Failed to load config for ${nodeName}:`, error)
      return null
    }
  }

  // 加载所有节点配置
  loadAllConfigs() {
    try {
      const configs = {}
      if (!fs.existsSync(this.configDir)) {
        return configs
      }

      const files = fs.readdirSync(this.configDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          const nodeName = file.replace('.json', '')
          const config = this.loadNodeConfig(nodeName)
          if (config) {
            configs[nodeName] = config
          }
        }
      }
      return configs
    } catch (error) {
      console.error('Failed to load all configs:', error)
      return {}
    }
  }

  // 删除节点配置
  deleteNodeConfig(nodeName) {
    try {
      const configPath = this.getConfigPath(nodeName)
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath)
      }
      return { success: true }
    } catch (error) {
      console.error(`Failed to delete config for ${nodeName}:`, error)
      return { success: false, error: error.message }
    }
  }

  // 重置所有配置
  resetAllConfigs() {
    try {
      if (fs.existsSync(this.configDir)) {
        const files = fs.readdirSync(this.configDir)
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.configDir, file))
          }
        }
      }
      return { success: true }
    } catch (error) {
      console.error('Failed to reset all configs:', error)
      return { success: false, error: error.message }
    }
  }
}

module.exports = ConfigManager
