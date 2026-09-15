/** "Codex · gpt-6-astra": how an agent seat is labelled everywhere at the table. */
import type { AgentInfo } from '../api/types'

const DRIVER_NAME: Record<AgentInfo['driver'], string> = { claude: 'Claude', codex: 'Codex' }

export function agentLabel(agent: AgentInfo | undefined): string | null {
  return agent ? `${DRIVER_NAME[agent.driver]} · ${agent.model}` : null
}
