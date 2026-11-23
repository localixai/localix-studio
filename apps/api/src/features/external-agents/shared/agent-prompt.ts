/** One answer of a question a coding agent's terminal is asking. */
export interface AgentPromptOption {
  label: string
  /** The answer Enter would give now. */
  selected: boolean
}

/**
 * A question the agent's terminal is waiting on, read off its screen: folder trust, a permission,
 * a login method. Until it is answered the agent reads no message, so a chat shows it.
 */
export interface AgentPrompt {
  /** `choice`: answered by picking an option, or Enter. `text`: answered by typing (a login code). */
  kind: 'choice' | 'text'
  /** The question as the agent draws it, without its options. */
  question: string[]
  options: AgentPromptOption[]
  /** A link the question asks to open, joined back together where the screen wrapped it. */
  url?: string
}

/** What a chat shows of its agent's terminal besides the conversation. */
export interface AgentScreen {
  /** False once the agent's terminal has ended (it was told to exit, or quit on its own). */
  running: boolean
  prompt: AgentPrompt | null
  /** The bottom of its screen, for whatever it shows that is not a question read here. */
  tail: string[]
  /** The agent runs headless: each message is a turn, and it needs no terminal to be chatted with. */
  headless?: boolean
  /** A headless turn is running. */
  busy?: boolean
  /** Why the last headless turn failed, in the agent's words where it gave them. */
  error?: string
}

/** Keys a chat can press in its agent's terminal. */
export const AGENT_KEYS = ['up', 'down', 'enter', 'escape', 'tab'] as const
export type AgentKey = (typeof AGENT_KEYS)[number]

/** Whether the agent is signed in, as its own CLI reports. */
export interface AgentAccount {
  loggedIn: boolean
  email?: string
  /** The plan or billing the sign-in uses: `pro`, `max`, an API key. */
  plan?: string
}
