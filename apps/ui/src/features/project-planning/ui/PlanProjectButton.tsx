import { useState } from 'react'
import { ClipboardList, Cpu, Download, Server } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@localixai/kit/dialog'
import type { LocalModelChoice } from '../model/localModel'

/**
 * **Plan your project**, on an empty chat. With a model on this computer it starts planning at
 * once; without one, a popup offers to download a model or connect a model server first.
 */
export function PlanProjectButton(props: {
  check: () => Promise<LocalModelChoice | null>
  start: (choice: LocalModelChoice) => Promise<void>
  onDownloadModel: () => void
  onConnectServer: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const plan = async () => {
    if (busy) return
    setBusy(true)
    try {
      const choice = await props.check()
      if (choice) await props.start(choice)
      else setAsking(true)
    } finally {
      setBusy(false)
    }
  }
  const leaveFor = (go: () => void) => () => {
    setAsking(false)
    go()
  }
  return (
    <>
      <Button variant="field" size="lg" disabled={busy} onClick={() => void plan()}>
        <ClipboardList data-icon="inline-start" />
        Plan your project
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="size-4" aria-hidden />
              Connect a local model
            </DialogTitle>
            <DialogDescription>
              Planning runs on a model on this computer, so your project details stay here. Download
              one, or connect a model server you already run (Ollama, LM Studio). Then press Plan
              your project again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAsking(false)}>Not now</Button>
            <Button onClick={leaveFor(props.onConnectServer)}>
              <Server data-icon="inline-start" />
              Connect a model server
            </Button>
            <Button variant="mono" onClick={leaveFor(props.onDownloadModel)}>
              <Download data-icon="inline-start" />
              Download a model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
