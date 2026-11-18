import { inspector } from '@/shared/lib/inspectorBus'
import { navigateSettings } from '@/shared/lib/settingsNavBus'
import { openModelPicker } from '@/shared/lib/modelPickerBus'
import { toast } from '@/shared/lib/notify'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import { checkLocalModel, startPlanning } from '../model/startPlanning'
import { PlanProjectButton } from './PlanProjectButton'

/** The empty chat's **Plan your project**, wired to this chat. */
export function PlanProject({ sessionId }: { sessionId: string }) {
  return (
    <PlanProjectButton
      check={checkLocalModel}
      start={async (choice) => {
        try {
          await startPlanning(sessionId, choice)
        } catch (cause) {
          toast.error('Could not start planning', {
            description: errorMessage(cause, '') || undefined,
          })
        }
      }}
      onDownloadModel={() => {
        inspector.openSettings()
        navigateSettings('models')
      }}
      onConnectServer={() => openModelPicker({ sessionId })}
    />
  )
}
