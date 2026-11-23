import { EmptyState } from '@/entities/chat/ui/EmptyState'
import { PlanProject } from '@/features/project-planning/ui/PlanProject'

/** The empty chat: the Localix bird, and an offer to plan the project with a local model. */
export function ChatEmptyState({ sessionId }: { sessionId: string | null }) {
  return (
    <>
      <EmptyState />
      {sessionId ? (
        <div className="flex justify-center px-4 pb-8">
          <PlanProject sessionId={sessionId} />
        </div>
      ) : null}
    </>
  )
}
