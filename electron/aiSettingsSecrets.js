function mergeAISecrets(existing, incoming) {
  const merged = globalThis.structuredClone(incoming)
  const existingProviders = new Map(
    (existing?.apiConfig?.global?.aiModelProviders || []).map(provider => [provider.id, provider]),
  )
  for (const provider of merged?.apiConfig?.global?.aiModelProviders || []) {
    const previous = existingProviders.get(provider.id)
    if (!provider.apiKey && provider.apiKeySet !== false) provider.apiKey = previous?.apiKey || ''
  }
  for (const [stage, override] of Object.entries(merged?.apiConfig?.nodeOverrides || {})) {
    const previous = existing?.apiConfig?.nodeOverrides?.[stage]
    if (!override.apiKey && override.apiKeySet !== false) override.apiKey = previous?.apiKey || ''
  }
  return merged
}

function redactAISecrets(config) {
  if (!config) return config
  const redacted = globalThis.structuredClone(config)
  for (const provider of redacted?.apiConfig?.global?.aiModelProviders || []) provider.apiKey = ''
  for (const override of Object.values(redacted?.apiConfig?.nodeOverrides || {})) override.apiKey = ''
  return redacted
}

module.exports = { mergeAISecrets, redactAISecrets }
