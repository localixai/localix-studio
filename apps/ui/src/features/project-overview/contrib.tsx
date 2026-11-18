import { Suspense } from 'react'
import { LayoutDashboard } from 'lucide-react'
import type { MiniAppUiHost } from '@localixai/mini-app-sdk/ui'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { lazyNamed } from '@/shared/lib/lazyNamed'

export const PROJECT_OVERVIEW_KIND = 'project-overview'

const ProjectOverviewLazy = lazyNamed(() => import('./ui/ProjectOverview'), 'ProjectOverview')

function ProjectOverviewBody() {
  return (
    <Suspense fallback={<LoadingHint>Opening the project…</LoadingHint>}>
      <ProjectOverviewLazy />
    </Suspense>
  )
}

let registered = false

/** Project overview: the open project's git activity and model-drawn diagrams, one rail button. */
export function registerUi(host: MiniAppUiHost): void {
  if (registered) return
  registered = true
  host.workItems.register({
    kind: PROJECT_OVERVIEW_KIND,
    Component: ProjectOverviewBody,
    Icon: LayoutDashboard,
    restorable: true,
    scope: 'global',
  })
  host.railViewlets.register({
    kind: PROJECT_OVERVIEW_KIND,
    title: 'Project',
    label: 'Project overview — git activity & diagrams',
    toolCategory: 'utilities',
    defaultArea: 'bar',
    keywords: [
      'project',
      'overview',
      'git',
      'activity',
      'commits',
      'diagram',
      'flowchart',
      'mermaid',
    ],
    Icon: LayoutDashboard,
  })
}
