import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { SectionHeading } from '@localixai/kit/section-heading'
import { StatCard } from '@localixai/kit/stat'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { useChatStore } from '@/entities/chat/model/store'
import { useUiNavigation } from '@/shared/hooks/useUiNavigation'
import { buildActivityYear } from '../model/activityYear'
import { useGitActivity } from '../model/useGitActivity'
import { ActivityHeatmap } from './ActivityHeatmap'
import { DiagramCard } from './DiagramCard'

const SECTION = 'space-y-3 rounded-md border border-border/60 bg-foreground/[0.02] p-4'

function GitActivitySection({ projectId }: { projectId: string }) {
  const { state, reload } = useGitActivity(projectId)
  // The grid ends on the day the page opened; Refresh re-reads the history, not the clock.
  const [now] = useState(() => Date.now())
  const year = useMemo(
    () => (state.status === 'ready' ? buildActivityYear(state.activity.commits, now) : null),
    [state, now],
  )
  const body = () => {
    if (state.status === 'error')
      return <p className="text-xs text-status-error">{state.message}</p>
    if (state.status !== 'ready' || !year)
      return <LoadingHint>Reading the git history…</LoadingHint>
    const { activity } = state
    if (!activity.repository)
      return (
        <p className="text-xs text-text-soft">
          This project&apos;s folder is not a git repository.
        </p>
      )
    return (
      <>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
          <StatCard
            label="Commits"
            value={year.stats.total}
            hint={`${year.stats.thisWeek} this week`}
          />
          <StatCard label="Active days" value={year.stats.activeDays} hint="in the last year" />
          <StatCard label="Current streak" value={year.stats.currentStreak} hint="days in a row" />
          <StatCard label="Longest streak" value={year.stats.longestStreak} hint="days in a row" />
          <StatCard
            label="Best day"
            value={year.stats.busiest?.count ?? 0}
            hint={year.stats.busiest?.key ?? 'nothing yet'}
          />
        </div>
        <ActivityHeatmap year={year} commits={activity.commits} />
        {activity.truncated ? (
          <p className="text-2xs text-text-soft">Only the most recent commits are shown.</p>
        ) : null}
      </>
    )
  }
  const refresh = (
    <Button size="sm" onClick={reload} aria-label="Read the git history again">
      <RefreshCw data-icon="inline-start" />
      Refresh
    </Button>
  )
  return (
    <section className={SECTION} aria-label="Git activity">
      <SectionHeading
        level="section"
        title="Git activity"
        description="Commits in the last year, read from this folder's own git history. No account or key."
        actions={refresh}
      />
      {body()}
    </section>
  )
}

/** The open project at a glance: its git activity, and diagrams of it drawn by a model. */
export function ProjectOverview() {
  const project = useChatStore((state) =>
    state.projects.find((candidate) => candidate.id === state.activeProjectId),
  )
  const nav = useUiNavigation({ sessionId: null })
  if (!project) return <LoadingHint>Open a project to see its overview.</LoadingHint>
  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 px-4 py-5 @2xl:px-6">
        <SectionHeading
          level="page"
          title={project.name}
          description={<code className="text-2xs">{project.workingDir}</code>}
        />
        <GitActivitySection projectId={project.id} />
        <section className={SECTION} aria-label="Describe and diagram">
          <SectionHeading
            level="section"
            title="Describe and diagram"
            description="Flowcharts and diagrams of this project, drawn by the model you connect."
          />
          <DiagramCard
            projectId={project.id}
            projectName={project.name}
            onOpenChat={(sessionId) => nav.open({ kind: 'session', sessionId })}
            onChooseModel={() => nav.open({ kind: 'settings', tab: 'models' })}
          />
        </section>
      </div>
    </div>
  )
}
