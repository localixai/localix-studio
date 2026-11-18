import { ClipboardList, Code2 } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@localixai/kit/dialog'

/** Asked once, on a chat's first message in the normal mode: plan the work, or start coding. */
export function PlanOrCodeDialog(props: {
  open: boolean
  onPlan: () => void
  onCode: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan or code?</DialogTitle>
          <DialogDescription>
            Plan switches this chat to Plan mode: the agent reads the project, describes and plans
            it — the overview, the flow map in Project Space, the tasks on the board — and never
            changes code. Code starts working on the project as usual.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={props.onCode}>
            <Code2 data-icon="inline-start" />
            Code
          </Button>
          <Button variant="mono" onClick={props.onPlan}>
            <ClipboardList data-icon="inline-start" />
            Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
