import { expect, test } from 'bun:test'

import type {
  MiniAppUiHost,
  RailViewletContribution,
  WorkItemKindContribution,
} from '@localixai/mini-app-sdk/ui'
import { registerUi } from './contrib'

test('the Project overview is a rail button that opens one app-wide, restorable tab', () => {
  const workItems: WorkItemKindContribution[] = []
  const railViewlets: RailViewletContribution[] = []
  const host = {
    workItems: { register: (item: WorkItemKindContribution) => workItems.push(item) },
    railViewlets: { register: (viewlet: RailViewletContribution) => railViewlets.push(viewlet) },
  } as unknown as MiniAppUiHost

  registerUi(host)

  expect(workItems).toMatchObject([{ kind: 'project-overview', scope: 'global', restorable: true }])
  expect(railViewlets).toMatchObject([
    { kind: 'project-overview', title: 'Project', defaultArea: 'bar' },
  ])
  expect(railViewlets[0]?.keywords).toEqual(expect.arrayContaining(['git', 'flowchart']))
})
